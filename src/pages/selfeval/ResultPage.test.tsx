import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  makeActivity,
  makeDetail,
  makeReport,
  makeSections,
} from "./testFixtures";

const {
  stepMock,
  shellMock,
  navigateMock,
  generateMock,
  editMock,
  confirmMock,
  detailMock,
  toastMock,
} = vi.hoisted(() => ({
  stepMock: vi.fn(),
  shellMock: vi.fn(),
  navigateMock: vi.fn(),
  generateMock: vi.fn(),
  editMock: vi.fn(),
  confirmMock: vi.fn(),
  detailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  writeGenerate: generateMock,
  writeEdit: editMock,
  writeConfirmFeeling: confirmMock,
  fetchSessionDetail: detailMock,
  fetchEntry: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => toastMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import ResultPage from "./ResultPage";

const refetchEntry = vi.fn();

function renderPage(search = "") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[`/app/selfeval/s/s1/result${search}`]}>
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/result"
            element={<ResultPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function withReport(
  sections = makeSections(),
  extra: Parameters<typeof makeDetail>[0] = {},
) {
  const report = makeReport(sections);
  return makeDetail({
    session: { currentStep: 4 },
    activities: [makeActivity("core")],
    reports: { generation: report },
    current: report,
    ...extra,
  });
}

const writtenOk = (sections = makeSections(), regenerationsLeft = 3) => ({
  kind: "ok",
  data: {
    ok: true,
    report: {
      id: "r2",
      revision: 2,
      sections,
      charCount: { withSpace: 510, withoutSpace: 420 },
    },
    charged: true,
    regenerationsLeft,
    currentStep: 4,
    attempts: 1,
    softIssues: [],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  shellMock.mockReturnValue({ refetchEntry });
});

describe("ResultPage 생성", () => {
  test("generate=1 이면 진입 즉시 작성본을 만들고 로딩 문구를 보인다", async () => {
    detailMock.mockResolvedValue(withReport());
    generateMock.mockReturnValue(new Promise(() => {}));
    renderPage("?generate=1");
    expect(stepMock).toHaveBeenCalledWith(5);
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith("s1"));
    expect(await screen.findByText("1차 작성본을 만드는 중")).toBeTruthy();
  });

  test("생성 리포트가 없으면 generate 없이 들어와도 만든다", async () => {
    detailMock.mockResolvedValue(makeDetail({ session: { currentStep: 3 } }));
    generateMock.mockResolvedValue(writtenOk());
    renderPage();
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    expect(await screen.findByText("배차표 자료를 비교했어요.")).toBeTruthy();
  });

  test("리포트가 이미 있고 generate 도 없으면 부르지 않고 그대로 보여 준다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "자기평가서가 완성됐습니다" }),
    ).toBeTruthy();
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("한도와 이용권 오류는 안내 카드로 보인다", async () => {
    detailMock.mockResolvedValue(makeDetail({ session: { currentStep: 3 } }));
    generateMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByRole("link", { name: "이용권 보러 가기" }),
    ).toBeTruthy();
  });
});

describe("ResultPage 결과", () => {
  test("글자 수 칩은 공백 포함과 제외, 목표 대비 차이를 보인다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    expect(await screen.findByText("공백 포함 510자")).toBeTruthy();
    expect(screen.getByText("공백 제외 420자")).toBeTruthy();
    expect(screen.getByText("목표 500자 대비 +10")).toBeTruthy();
    expect(screen.queryByText("±5% 초과")).toBeNull();
  });

  test("목표에서 5% 를 넘으면 경고 칩, 목표가 없으면 목표 칩이 없다", async () => {
    detailMock.mockResolvedValue(
      withReport(makeSections(), { session: { targetChars: 400 } }),
    );
    const view = renderPage();
    expect(await screen.findByText("±5% 초과")).toBeTruthy();
    view.unmount();
    detailMock.mockResolvedValue(
      withReport(makeSections(), { session: { targetChars: null } }),
    );
    renderPage();
    await screen.findByText("공백 포함 510자");
    expect(screen.queryByText(/목표 .*자 대비/)).toBeNull();
  });

  test("활동 근거 문장을 누르면 활동명, 항목, 기록 원문을 우측에 보인다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "배차표 자료를 비교했어요." }),
    );
    const panel = screen.getByRole("complementary", { name: "문장 근거" });
    expect(within(panel).getByText("버스 배차 분석")).toBeTruthy();
    expect(within(panel).getByText("방법")).toBeTruthy();
    expect(within(panel).getByText("배차표 자료를 비교했다")).toBeTruthy();
  });

  test("문단별 근거 요약에 역할 라벨과 활동명이 나온다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    const panel = await screen.findByRole("complementary", {
      name: "문장 근거",
    });
    expect(within(panel).getByText(/1문단 연계 발전 지점/)).toBeTruthy();
    expect(within(panel).getByText(/버스 배차 분석/)).toBeTruthy();
  });

  test("확인이 필요한 표현은 목록에 나오고 맞아요는 확인 요청을 보낸다", async () => {
    detailMock.mockResolvedValue(withReport());
    const confirmed = makeSections();
    const target = confirmed.paragraphs[1]?.sentences[0];
    if (target) target.confirmed = true;
    confirmMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        report: {
          id: "r1",
          revision: 1,
          sections: confirmed,
          charCount: { withSpace: 510, withoutSpace: 420 },
        },
      },
    });
    renderPage();
    const card = await screen.findByRole("complementary", {
      name: "확인이 필요한 표현",
    });
    expect(within(card).getByText("뿌듯했어요.")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "맞아요" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith("s1", "p2s1"));
    expect(
      await screen.findByText("확인이 필요한 표현이 없습니다"),
    ).toBeTruthy();
  });

  test("본문을 바꾸면 세션 상세를 다시 읽는다(검증 화면이 낡은 본문을 보지 않게)", async () => {
    detailMock.mockResolvedValue(withReport());
    confirmMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        report: {
          id: "r1",
          revision: 2,
          sections: makeSections(),
          charCount: { withSpace: 1, withoutSpace: 1 },
        },
      },
    });
    renderPage();
    const card = await screen.findByRole("complementary", {
      name: "확인이 필요한 표현",
    });
    const before = detailMock.mock.calls.length;
    fireEvent.click(within(card).getByRole("button", { name: "맞아요" }));
    await waitFor(() =>
      expect(detailMock.mock.calls.length).toBeGreaterThan(before),
    );
  });

  test("지우기는 그 문장을 뺀 문단 텍스트로 저장한다", async () => {
    detailMock.mockResolvedValue(withReport());
    editMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        report: {
          id: "r1",
          revision: 2,
          sections: makeSections(),
          charCount: { withSpace: 1, withoutSpace: 1 },
        },
      },
    });
    renderPage();
    const card = await screen.findByRole("complementary", {
      name: "확인이 필요한 표현",
    });
    fireEvent.click(within(card).getByRole("button", { name: "지우기" }));
    await waitFor(() =>
      expect(editMock).toHaveBeenCalledWith("s1", [
        "배차표 자료를 비교했어요.",
        "",
      ]),
    );
  });

  test("확인이 필요한 표현이 없으면 초록 안내 카드를 보인다", async () => {
    const sections = makeSections();
    const target = sections.paragraphs[1]?.sentences[0];
    if (target) target.feeling = false;
    detailMock.mockResolvedValue(withReport(sections));
    renderPage();
    expect(
      await screen.findByText("확인이 필요한 표현이 없습니다"),
    ).toBeTruthy();
  });
});

describe("ResultPage 버튼", () => {
  test("남은 횟수가 있으면 다시 생성이 생성을 다시 부른다", async () => {
    detailMock.mockResolvedValue(withReport());
    generateMock.mockResolvedValue(writtenOk(makeSections(), 1));
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "다시 생성 (남은 3회)" }),
    );
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith("s1"));
    expect(
      await screen.findByRole("button", { name: "다시 생성 (남은 1회)" }),
    ).toBeTruthy();
  });

  test("횟수를 다 쓰면 다시 생성이 막히고 안내가 나온다", async () => {
    detailMock.mockResolvedValue(
      withReport(makeSections(), { regenerationsLeft: 0 }),
    );
    renderPage();
    const button = await screen.findByRole("button", {
      name: "다시 생성 (남은 0회)",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "다시 생성을 3회 모두 썼어요. 직접 고치거나 검증으로 넘어가 주세요",
      ),
    ).toBeTruthy();
  });

  test("직접 고치기는 문단별 입력으로 바꾸고 저장하면 문단 배열을 보낸다", async () => {
    detailMock.mockResolvedValue(withReport());
    editMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        report: {
          id: "r1",
          revision: 2,
          sections: makeSections(),
          charCount: { withSpace: 1, withoutSpace: 1 },
        },
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "직접 고치기" }));
    const first = screen.getByRole("textbox", { name: "1문단" });
    fireEvent.change(first, { target: { value: "고친 1문단이에요." } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(editMock).toHaveBeenCalledWith("s1", [
        "고친 1문단이에요.",
        "뿌듯했어요.",
      ]),
    );
  });

  test("직접 고치기를 취소하면 저장 없이 돌아온다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "직접 고치기" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(editMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "1문단" })).toBeNull();
  });

  test("검증하기는 검증 화면으로 이동한다", async () => {
    detailMock.mockResolvedValue(withReport());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "검증하기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/verify");
  });
});
