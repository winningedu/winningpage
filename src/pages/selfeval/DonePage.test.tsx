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

const { stepMock, shellMock, navigateMock, detailMock, toastMock } = vi.hoisted(
  () => ({
    stepMock: vi.fn(),
    shellMock: vi.fn(),
    navigateMock: vi.fn(),
    detailMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }),
);

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
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

import DonePage from "./DonePage";

function renderPage(state?: unknown) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={[{ pathname: "/app/selfeval/s/s1/done", state }]}
      >
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/done"
            element={<DonePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PLAN = {
  planItemId: "pi1",
  growthApplied: true,
  growthSnapshot: {
    reportId: "g1",
    issuedAt: "2026-10-01T00:00:00Z",
    narrativeTheme: null,
    gradeSubthemes: [],
    stage: null,
    weakAxes: [],
    alignedSignals: [],
    conflictingSignals: [],
    planItems: [
      {
        id: "pi1",
        title: "통계 탐구 설계",
        description: null,
        axis: null,
        category: null,
      },
    ],
  },
};

function completed(session: Record<string, unknown> = {}) {
  const sections = makeSections();
  sections.paragraphs[0]?.sentences.push(
    {
      id: "x2",
      text: "두 번째 문장이에요.",
      evidence: null,
      feeling: false,
      confirmed: false,
    },
    {
      id: "x3",
      text: "세 번째 문장이에요.",
      evidence: null,
      feeling: false,
      confirmed: false,
    },
    {
      id: "x4",
      text: "네 번째 문장이에요.",
      evidence: null,
      feeling: false,
      confirmed: false,
    },
  );
  const final = makeReport(sections, { score: 82 });
  return makeDetail({
    session: {
      status: "completed",
      currentStep: 6,
      completedAt: "2026-10-02T03:00:00Z",
      ...session,
    },
    activities: [makeActivity("core"), makeActivity("support")],
    reports: { final },
    current: final,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  shellMock.mockReturnValue({ refetchEntry: vi.fn() });
});

describe("DonePage", () => {
  test("6단계로 알리고 머리말과 적립 카드를 보인다", async () => {
    detailMock.mockResolvedValue(completed());
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(6);
    expect(
      await screen.findByRole("heading", { name: "최종본을 저장했습니다" }),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "활동 기록 저장소에 7항목(주제, 개념, 방법, 결과, 한계, 수치, 자료명)으로 적립했습니다",
      ),
    ).toBeTruthy();
  });

  test("본문 미리보기는 제목, 잠금 배지, 앞 세 문장만 보인다", async () => {
    detailMock.mockResolvedValue(completed());
    renderPage();
    expect(await screen.findByText("수학 자기평가서")).toBeTruthy();
    expect(screen.getByText("잠금")).toBeTruthy();
    const preview = screen.getByLabelText("본문 미리보기");
    expect(preview.textContent).toContain("배차표 자료를 비교했어요.");
    expect(preview.textContent).toContain("세 번째 문장이에요.");
    expect(preview.textContent).not.toContain("네 번째 문장이에요.");
  });

  test("우측 요약에 점수, 제출 가능, 저장일, 글자 수, 활동 수를 보인다", async () => {
    detailMock.mockResolvedValue(completed());
    renderPage();
    const panel = await screen.findByRole("complementary", {
      name: "검증 요약",
    });
    expect(within(panel).getByText("82 / 100")).toBeTruthy();
    expect(within(panel).getByText("제출 가능")).toBeTruthy();
    expect(within(panel).getByText("저장일 2026.10.02")).toBeTruthy();
    expect(within(panel).getByText("공백 포함 510자")).toBeTruthy();
    expect(within(panel).getByText("사용한 활동 2건")).toBeTruthy();
  });

  test("회신 sent 는 과제를 완료로 보냈다고 알린다", async () => {
    detailMock.mockResolvedValue(completed(PLAN));
    renderPage({ reply: { status: "sent" } });
    expect(
      await screen.findByText(
        "성장설계 실행계획의 '통계 탐구 설계' 를 완료로 보냈습니다",
      ),
    ).toBeTruthy();
  });

  test("회신 failed 는 파란 안내 카드를 보인다", async () => {
    detailMock.mockResolvedValue(completed(PLAN));
    renderPage({ reply: { status: "failed" } });
    expect(
      await screen.findByText(
        "자기평가서는 저장했어요. 성장설계 회신은 실패했어요. 다음에 들어오면 자동으로 다시 보내요",
      ),
    ).toBeTruthy();
  });

  test("회신 skipped 는 과제가 있었을 때만 완료로 보내지 않았다고 알린다", async () => {
    detailMock.mockResolvedValue(completed(PLAN));
    const view = renderPage({ reply: { status: "skipped" } });
    expect(
      await screen.findByText("과제는 완료로 보내지 않았어요"),
    ).toBeTruthy();
    view.unmount();
    detailMock.mockResolvedValue(completed());
    renderPage({ reply: { status: "skipped" } });
    await screen.findByText("수학 자기평가서");
    expect(screen.queryByText("과제는 완료로 보내지 않았어요")).toBeNull();
  });

  test("이동 상태 없이 들어와도 replyPending 이 있으면 회신 실패로 본다", async () => {
    detailMock.mockResolvedValue(
      completed({
        ...PLAN,
        replyPending: {
          itemId: "pi1",
          refId: "r",
          failedAt: "t",
          lastError: "e",
        },
      }),
    );
    renderPage();
    expect(await screen.findByText(/성장설계 회신은 실패했어요/)).toBeTruthy();
  });

  test("보관함으로는 보관함 화면으로 이동한다", async () => {
    detailMock.mockResolvedValue(completed());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "보관함으로" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/archive");
  });

  test("전체 복사는 최종본 전체를 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    detailMock.mockResolvedValue(completed());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "전체 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "배차표 자료를 비교했어요. 두 번째 문장이에요. 세 번째 문장이에요. 네 번째 문장이에요.\n\n뿌듯했어요.",
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith("복사했어요");
  });

  test("아직 저장하지 않은 세션은 저장 안내와 검증 화면 이동만 보인다", async () => {
    detailMock.mockResolvedValue(makeDetail({ session: { currentStep: 5 } }));
    renderPage();
    expect(
      await screen.findByText("아직 최종본으로 저장하지 않았어요"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검증 화면으로" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/verify");
  });
});
