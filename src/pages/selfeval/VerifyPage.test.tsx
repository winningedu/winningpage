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
  makeAnalysis,
  makeDetail,
  makeReport,
  makeSections,
  makeVerification,
} from "./testFixtures";

const {
  stepMock,
  shellMock,
  navigateMock,
  verifyMock,
  finalizeMock,
  detailMock,
  toastMock,
} = vi.hoisted(() => ({
  stepMock: vi.fn(),
  shellMock: vi.fn(),
  navigateMock: vi.fn(),
  verifyMock: vi.fn(),
  finalizeMock: vi.fn(),
  detailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  verifySession: verifyMock,
  finalizeSession: finalizeMock,
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

import VerifyPage from "./VerifyPage";

const refetchEntry = vi.fn();

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/app/selfeval/s/s1/verify"]}>
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/verify"
            element={<VerifyPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const GEN_AT = "2026-10-01T00:00:00Z";
const VERIFY_AT = "2026-10-01T00:10:00Z";

function verified(
  sections = makeVerification(),
  extra: Parameters<typeof makeDetail>[0] = {},
) {
  const gen = makeReport(makeSections(), { createdAt: GEN_AT });
  return makeDetail({
    session: { currentStep: 5 },
    activities: [
      makeActivity("core", {
        analysis: makeAnalysis({
          concept: "표본 추출",
          method: "배차표 자료를 비교했다",
          result: "평균 12분이었다. 의미가 있었다.",
          limitation: "표본이 작았다",
        }),
      }),
      makeActivity("support"),
    ],
    reports: {
      generation: gen,
      verification: makeReport(sections, {
        id: "v1",
        createdAt: VERIFY_AT,
        score: sections.total,
        mandatoryFixes: sections.mandatoryFixes,
      }),
    },
    current: gen,
    ...extra,
  });
}

const verifyOk = (sections = makeVerification(), charged = true) => ({
  kind: "ok",
  data: {
    ok: true,
    verification: {
      id: "v2",
      revision: 2,
      sections,
      score: sections.total,
      mandatoryFixes: sections.mandatoryFixes,
    },
    charged,
    currentStep: 5,
    attempts: 1,
    softIssues: [],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  shellMock.mockReturnValue({
    refetchEntry,
    entry: { quota: { quotaRemaining: 7, quotaTotal: 10 } },
  });
});

describe("VerifyPage 검증 실행", () => {
  test("검증이 없으면 진입 즉시 검증하고 로딩 문구를 보인다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        session: { currentStep: 4 },
        reports: { generation: makeReport(makeSections()) },
        current: makeReport(makeSections()),
      }),
    );
    verifyMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(6);
    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith("s1"));
    expect(
      await screen.findByText("28개 확인 문장을 점검하는 중"),
    ).toBeTruthy();
  });

  test("본문이 검증보다 뒤에 만들어졌으면 낡았다고 보고 다시 검증한다", async () => {
    const stale = verified();
    stale.data.current = makeReport(makeSections(), {
      createdAt: "2026-10-01T01:00:00Z",
    });
    detailMock.mockResolvedValue(stale);
    verifyMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitFor(() => expect(verifyMock).toHaveBeenCalled());
  });

  test("최신 검증이 있으면 다시 부르지 않는다", async () => {
    detailMock.mockResolvedValue(verified());
    renderPage();
    expect(await screen.findByText("판단과 근거")).toBeTruthy();
    expect(verifyMock).not.toHaveBeenCalled();
  });

  test("검증 실패는 되돌림 안내와 다시 검증하기를 보인다", async () => {
    detailMock.mockResolvedValue(
      makeDetail({
        session: { currentStep: 4 },
        reports: { generation: makeReport(makeSections()) },
        current: makeReport(makeSections()),
      }),
    );
    verifyMock.mockResolvedValue({
      kind: "error",
      status: 502,
      code: "MODEL_UPSTREAM_FAILED",
      message: "x",
      extra: { attempts: 2, reversed: true },
    });
    renderPage();
    expect(await screen.findByText("검증을 마치지 못했어요")).toBeTruthy();
    expect(
      screen.getByText(/이용 횟수 1회는 자동으로 복구됐어요/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 검증하기" })).toBeTruthy();
  });
});

describe("VerifyPage 결과 카드", () => {
  test("8항목 카드에 판별력, 점수, 통과와 확인 필요 표시가 나온다", async () => {
    detailMock.mockResolvedValue(verified());
    renderPage();
    const card = (await screen.findByText("판단과 근거")).closest(
      "section",
    ) as HTMLElement;
    expect(within(card).getByText("+70p")).toBeTruthy();
    expect(within(card).getByText("10 / 15")).toBeTruthy();
    expect(within(card).getByText("판단 문장이 있어요")).toBeTruthy();
    expect(within(card).getByText("확인 필요")).toBeTruthy();
  });

  test("판별력이 없는 항목은 판별력 없음, 분량 판정을 끈 형식은 안내를 보인다", async () => {
    const sections = makeVerification();
    const first = sections.items[0];
    if (first) first.discrimination = null;
    sections.format = [
      {
        key: "target_range",
        label: "분량",
        pass: true,
        detail: "",
        skipped: true,
      },
    ];
    detailMock.mockResolvedValue(verified(sections));
    renderPage();
    expect(await screen.findByText("판별력 없음")).toBeTruthy();
    expect(screen.getByText("분량 판정을 껐어요")).toBeTruthy();
  });

  test("고칠 곳이 없으면 큰 결손 없음, 있으면 항목 라벨과 문구를 보인다", async () => {
    detailMock.mockResolvedValue(verified());
    const view = renderPage();
    expect(await screen.findByText("항목별로 큰 결손은 없습니다")).toBeTruthy();
    view.unmount();
    detailMock.mockResolvedValue(
      verified(
        makeVerification({
          improvements: [
            {
              key: "limitation",
              label: "한계",
              message: "한계를 적어 주세요",
              failedChecks: ["한계 문장"],
            },
          ],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText("한계를 적어 주세요")).toBeTruthy();
    expect(screen.getByText("한계 문장")).toBeTruthy();
  });

  test("성장설계 부합 카드는 점수 미반영 배지와 축별 현재 필요 건수를 보인다", async () => {
    detailMock.mockResolvedValue(
      verified(
        makeVerification({
          growthFit: {
            stageChecks: [{ text: "단계에 맞는 활동이에요", pass: true }],
            axisChecks: [
              {
                axis: "A",
                name: "학업역량",
                satisfied: false,
                current: 1,
                required: 3,
                guideline: "탐구를 더해요",
              },
            ],
          },
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText("점수 미반영")).toBeTruthy();
    expect(screen.getByText("학업역량 현재 1건 필요 3건")).toBeTruthy();
    expect(screen.getByText("탐구를 더해요")).toBeTruthy();
  });

  test("채점에서 뺀 항목을 보인다", async () => {
    detailMock.mockResolvedValue(verified());
    renderPage();
    expect(await screen.findByText("채점에서 뺀 항목")).toBeTruthy();
    expect(screen.getByText("채점 제외")).toBeTruthy();
  });
});

describe("VerifyPage 요약과 필수 수정", () => {
  test("검증 요약에 점수, 제출 가능, 통과와 확인 필요 수, 고지를 보인다", async () => {
    detailMock.mockResolvedValue(verified());
    renderPage();
    const panel = await screen.findByRole("complementary", {
      name: "검증 요약",
    });
    expect(within(panel).getByText("72 / 100")).toBeTruthy();
    expect(within(panel).getByText("제출 가능")).toBeTruthy();
    expect(within(panel).getByText("전체 항목 2")).toBeTruthy();
    expect(within(panel).getByText("통과 1")).toBeTruthy();
    expect(within(panel).getByText("확인 필요 1")).toBeTruthy();
    expect(
      within(panel).getByText(
        "이 점수는 학교 채점이나 학생부 평가 예측이 아니라 위닝 내부 기준입니다",
      ),
    ).toBeTruthy();
  });

  test("필수 수정이 있으면 경고 카드, 상투어 나열, 저장 비활성이 된다", async () => {
    detailMock.mockResolvedValue(
      verified(
        makeVerification({
          submittable: false,
          mandatoryFixes: [
            { key: "cliche", message: "상투어를 줄여 주세요", detail: null },
          ],
          clicheHits: ["성장했다", "깨달았다"],
        }),
      ),
    );
    renderPage();
    expect(
      await screen.findByText(
        "필수 수정이 남아 있어 제출 가능으로 보지 않아요",
      ),
    ).toBeTruthy();
    expect(screen.getByText("상투어를 줄여 주세요")).toBeTruthy();
    expect(screen.getByText(/성장했다/)).toBeTruthy();
    expect(screen.getByText("필수 수정 1건")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "최종본으로 저장",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("이번 작업 카드에 남은 횟수, 방향, 사용한 활동을 보인다", async () => {
    detailMock.mockResolvedValue(verified());
    verifyMock.mockResolvedValue(verifyOk());
    renderPage();
    const panel = await screen.findByRole("complementary", {
      name: "이번 작업",
    });
    expect(within(panel).getByText("남은 횟수 7 / 10")).toBeTruthy();
    expect(within(panel).getByText("방향 없이 진행")).toBeTruthy();
    expect(within(panel).getByText("핵심 버스 배차 분석")).toBeTruthy();
    expect(within(panel).getByText("보조 표본조사 설계")).toBeTruthy();
  });
});

describe("VerifyPage 저장", () => {
  test("저장 확인 모달에 7항목 초기값이 채워지고 확인하면 저장 뒤 완료 화면으로 간다", async () => {
    detailMock.mockResolvedValue(verified());
    finalizeMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        activityRecordId: "ar1",
        finalRevision: 1,
        reply: { status: "skipped" },
        currentStep: 6,
      },
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "최종본으로 저장" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      (within(dialog).getByLabelText("주제") as HTMLInputElement).value,
    ).toBe("버스 배차 분석");
    expect(
      (within(dialog).getByLabelText("개념") as HTMLTextAreaElement).value,
    ).toBe("표본 추출");
    expect(
      (within(dialog).getByLabelText("수치") as HTMLTextAreaElement).value,
    ).toBe("평균 12분이었다.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "확인하고 저장" }),
    );
    await waitFor(() =>
      expect(finalizeMock).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          topic: "버스 배차 분석",
          numbers: ["평균 12분이었다."],
        }),
        undefined,
      ),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/done", {
        state: { reply: { status: "skipped" } },
      }),
    );
  });

  test("성장설계 과제가 있으면 완료 처리 체크박스가 기본 체크로 나오고 값이 전달된다", async () => {
    const detail = verified(makeVerification(), {
      session: {
        currentStep: 5,
        planItemId: "pi1",
        growthApplied: true,
        growthSnapshot: {
          reportId: "g1",
          issuedAt: GEN_AT,
          narrativeTheme: "자료를 만드는 사람",
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
      },
    });
    detailMock.mockResolvedValue(detail);
    finalizeMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        activityRecordId: "a",
        finalRevision: 1,
        reply: { status: "sent" },
        currentStep: 6,
      },
    });
    renderPage();
    expect(await screen.findByText("자료를 만드는 사람")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최종본으로 저장" }));
    const dialog = await screen.findByRole("dialog");
    const box = within(dialog).getByRole("checkbox", {
      name: "이 자기평가서로 성장설계 과제 '통계 탐구 설계' 를 완료 처리해요",
    }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "확인하고 저장" }),
    );
    await waitFor(() =>
      expect(finalizeMock).toHaveBeenCalledWith("s1", expect.anything(), true),
    );
  });

  test("저장 중 VERIFICATION_STALE 이면 모달을 닫고 다시 검증한다", async () => {
    detailMock.mockResolvedValue(verified());
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "VERIFICATION_STALE",
      message: "낡음",
    });
    verifyMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "최종본으로 저장" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "확인하고 저장" }),
    );
    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith("s1"));
  });

  test("NOT_SUBMITTABLE 은 필수 수정 안내 토스트를 띄운다", async () => {
    detailMock.mockResolvedValue(verified());
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "NOT_SUBMITTABLE",
      message: "x",
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "최종본으로 저장" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "확인하고 저장" }),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "필수 수정이 남아 있어 저장할 수 없어요. 작성 화면에서 고쳐 주세요.",
      ),
    );
  });

  test("전체 복사는 현재 본문을 클립보드에 넣고 토스트로 알린다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    detailMock.mockResolvedValue(verified());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "전체 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "배차표 자료를 비교했어요.\n\n뿌듯했어요.",
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith("복사했어요");
  });

  test("작성 화면으로는 결과 화면으로 이동한다", async () => {
    detailMock.mockResolvedValue(verified());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "작성 화면으로" }),
    );
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/result");
  });
});
