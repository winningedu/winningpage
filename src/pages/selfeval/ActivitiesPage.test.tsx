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

const {
  shellMock,
  stepMock,
  navigateMock,
  pickListMock,
  pickSelectMock,
  pickManualMock,
  updateMock,
  detailMock,
  toastMock,
} = vi.hoisted(() => ({
  shellMock: vi.fn(),
  stepMock: vi.fn(),
  navigateMock: vi.fn(),
  pickListMock: vi.fn(),
  pickSelectMock: vi.fn(),
  pickManualMock: vi.fn(),
  updateMock: vi.fn(),
  detailMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalShell: shellMock,
  useSelfevalScreenStep: stepMock,
}));
vi.mock("@/lib/selfeval/api", () => ({
  pickList: pickListMock,
  pickSelect: pickSelectMock,
  pickManual: pickManualMock,
  updateSession: updateMock,
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

import ActivitiesPage from "./ActivitiesPage";

const refetchEntry = vi.fn();

type RowOpts = {
  score?: number | null;
  same?: boolean;
  unavailable?: string;
  used?: boolean;
  subject?: string;
  source?: "performance" | "deep" | "manual";
  grade?: "고1" | "고2" | "고3";
  reasons?: string[];
  result?: string | null;
};

function row(id: string, topic: string, o: RowOpts = {}) {
  const score = o.score === undefined ? 70 : o.score;
  return {
    activity: {
      id,
      sourceProgram: o.source ?? "performance",
      status: "confirmed",
      gradeLabel: o.grade ?? "고2",
      semester: 1,
      subjectGroup: null,
      subject: o.subject ?? "수학",
      topic,
      concept: null,
      method: null,
      result: o.result === undefined ? "결과 요약 문장" : o.result,
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: "2026-09-16T00:00:00+09:00",
    },
    fit:
      score === null
        ? null
        : {
            activityId: id,
            score,
            signals: [{ key: "same_subject", hit: o.same ?? false, delta: 0 }],
            reasons: o.reasons ?? [],
          },
    unavailableReason: o.unavailable ?? null,
    alreadyUsed: o.used ?? false,
    role: null,
  };
}

const SNAPSHOT = {
  reportId: "r1",
  issuedAt: "2026-09-14T00:00:00Z",
  narrativeTheme: "자료를 직접 만드는 사람",
  gradeSubthemes: [{ grade: "고2", stage: "flower", text: "2학년 소주제" }],
  stage: "flower",
  weakAxes: [],
  alignedSignals: [],
  conflictingSignals: [],
  planItems: [],
};

function sessionDetail(over: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: {
        id: "s1",
        status: "draft",
        currentStep: 1,
        academicYear: 2026,
        gradeLabel: "고2",
        semester: 1,
        area: "subject",
        subject: "수학",
        activityName: null,
        growthApplied: true,
        growthSnapshot: SNAPSHOT,
        planItemId: null,
        ...over,
      },
      activities: [],
    },
  };
}

function pickResponse(over: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      candidates: [
        row("a", "버스 배차 간격 분석", {
          score: 86,
          same: true,
          reasons: ["작성 과목과 같은 활동이에요"],
        }),
        row("b", "지역성을 활용한 마케팅", { score: 90, subject: "한국지리" }),
        row("c", "표본조사 설계", { score: 76, subject: "확률과 통계" }),
        row("d", "동아리 설문 점검", {
          score: 50,
          subject: "데이터 동아리",
          source: "manual",
        }),
      ],
      selection: null,
      auto: {
        coreId: "a",
        supportIds: ["b", "c"],
        coreMismatch: false,
        noneAboveThreshold: false,
      },
      sourceCounts: { performance: 3, deep: 0, manual: 1, total: 4 },
      direction: { mismatch: false },
      planCandidates: [],
      planItem: null,
      growthApplied: true,
      currentStep: 1,
      ...over,
    },
  };
}

function renderPage(url = "/app/selfeval/s/s1/activities") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/app/selfeval/s/:sessionId/activities"
            element={<ActivitiesPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const checkbox = (name: RegExp | string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

async function ready() {
  await screen.findByRole("button", { name: /분석하기$/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  refetchEntry.mockResolvedValue(undefined);
  shellMock.mockReturnValue({
    entry: { academicYearDefault: 2026, openSession: null },
    refetchEntry,
  });
  detailMock.mockResolvedValue(sessionDetail());
  pickListMock.mockResolvedValue(pickResponse());
});

describe("로딩과 오류", () => {
  test("3단계로 알리고 불러오는 동안 로딩을 보여 준다", () => {
    pickListMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(3);
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });

  test("활동을 불러오지 못하면 사유와 재시도 버튼을 보여 준다", async () => {
    pickListMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "서버가 바빠요",
    });
    renderPage();
    expect(await screen.findByText("활동을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText(/서버가 바빠요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await ready();
    expect(pickListMock).toHaveBeenCalledTimes(2);
  });
});

describe("헤더와 방향", () => {
  test("방향을 적용 중이면 추천 헤더와 성장설계 배너를 보여 준다", async () => {
    renderPage();
    await ready();
    expect(
      screen.getByRole("heading", {
        name: "이 방향에 맞는 활동을 골라뒀습니다",
      }),
    ).toBeTruthy();
    expect(screen.getByText("자료를 직접 만드는 사람")).toBeTruthy();
    expect(screen.getByText("2학년 소주제")).toBeTruthy();
  });

  test("방향을 쓰지 않으면 방향 없이 진행 중이라고 알린다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({ growthApplied: false, direction: null }),
    );
    renderPage();
    await ready();
    expect(
      screen.getByRole("heading", { name: "활동을 골라 주세요" }),
    ).toBeTruthy();
    expect(screen.getByText("방향 없이 진행 중")).toBeTruthy();
    expect(screen.queryByText("자료를 직접 만드는 사람")).toBeNull();
  });
});

describe("후보 카드", () => {
  test("출처 칩에 개수를 보여 주고 자동 추천 건수를 알린다", async () => {
    renderPage();
    await ready();
    expect(
      screen.getByRole("button", { name: "위닝 수행평가 3" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "직접 입력 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체 4" })).toBeTruthy();
    expect(screen.getByText("3건 선택됨")).toBeTruthy();
  });

  test("자동 추천을 미리 체크하고 작성 과목 활동을 핵심, 나머지를 보조로 표시한다", async () => {
    renderPage();
    await ready();
    expect(checkbox(/버스 배차/).checked).toBe(true);
    expect(checkbox(/지역성/).checked).toBe(true);
    expect(checkbox(/표본조사/).checked).toBe(true);
    expect(checkbox(/동아리 설문/).checked).toBe(false);
    const core = screen
      .getByRole("heading", { name: "버스 배차 간격 분석" })
      .closest("article");
    expect(within(core as HTMLElement).getByText("핵심")).toBeTruthy();
    expect(screen.getAllByText("보조")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "선택한 3건 분석하기" }),
    ).toBeTruthy();
  });

  test("카드에 선정 이유와 적합도, 요약을 보여 준다", async () => {
    renderPage();
    await ready();
    expect(screen.getByText("작성 과목과 같은 활동이에요")).toBeTruthy();
    expect(
      screen
        .getAllByRole("progressbar", { name: "적합도" })[0]
        ?.getAttribute("aria-valuenow"),
    ).toBe("86");
    expect(screen.getAllByText("결과 요약 문장").length).toBeGreaterThan(0);
  });

  test("체크를 바꾸면 핵심과 보조를 다시 계산한다", async () => {
    renderPage();
    await ready();
    fireEvent.click(checkbox(/버스 배차/));
    // 작성 과목 활동이 없어지면 최고점(90)이 핵심이 되고 불일치 경고가 뜬다.
    expect(
      screen.getByText(
        "작성 과목의 활동이 없어요. 선생님이 요구한 활동이 맞는지 확인하세요",
      ),
    ).toBeTruthy();
    const core = screen
      .getByRole("heading", { name: "지역성을 활용한 마케팅" })
      .closest("article");
    expect(within(core as HTMLElement).getByText("핵심")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "선택한 2건 분석하기" }),
    ).toBeTruthy();
  });

  test("모두 해제하면 분석하기를 막고 안내한다", async () => {
    renderPage();
    await ready();
    for (const name of [/버스 배차/, /지역성/, /표본조사/])
      fireEvent.click(checkbox(name));
    expect(
      (
        screen.getByRole("button", {
          name: "선택한 0건 분석하기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/한 건 이상 골라야 분석할 수 있어요/)).toBeTruthy();
  });

  test("추천 기준을 넘은 활동이 없으면 자동 선택 없이 목록만 보여 주고 안내한다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        auto: {
          coreId: null,
          supportIds: [],
          coreMismatch: false,
          noneAboveThreshold: true,
        },
      }),
    );
    renderPage();
    await ready();
    expect(checkbox(/버스 배차/).checked).toBe(false);
    expect(
      screen.getByText(/적합도가 기준에 못 미쳐 자동으로 고르지 않았어요/),
    ).toBeTruthy();
  });

  test("서버에 저장된 선택이 있으면 자동 추천 대신 그것을 쓴다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({ selection: { coreId: "d", supportIds: [] }, auto: null }),
    );
    renderPage();
    await ready();
    expect(checkbox(/동아리 설문/).checked).toBe(true);
    expect(checkbox(/버스 배차/).checked).toBe(false);
  });

  test("사용 불가 카드는 이유를 보여 주고 체크하려 하면 선택하지 않고 안내한다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        candidates: [
          row("a", "버스 배차 간격 분석", { score: 86, same: true }),
          row("u", "수행하지 않은 계획", {
            score: null,
            unavailable: "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
          }),
        ],
        auto: {
          coreId: "a",
          supportIds: [],
          coreMismatch: false,
          noneAboveThreshold: false,
        },
      }),
    );
    renderPage();
    await ready();
    expect(screen.getByText("사용 불가")).toBeTruthy();
    fireEvent.click(checkbox(/수행하지 않은 계획/));
    expect(checkbox(/수행하지 않은 계획/).checked).toBe(false);
    expect(
      screen.getAllByText("아직 수행하지 않은 계획이라 재료로 쓸 수 없어요")
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status", { name: "선택 안내" })).toHaveTextContent(
      "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
    );
  });

  test("이미 쓴 활동은 경고 칩을 달고 선택할 수 있다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        candidates: [
          row("a", "버스 배차 간격 분석", {
            score: 86,
            same: true,
            used: true,
          }),
        ],
        auto: {
          coreId: "a",
          supportIds: [],
          coreMismatch: false,
          noneAboveThreshold: false,
        },
      }),
    );
    renderPage();
    await ready();
    expect(screen.getByText("이미 사용")).toBeTruthy();
    expect(screen.getByText(/이전 자기평가서에서 쓴 활동이에요/)).toBeTruthy();
    expect(checkbox(/버스 배차/).checked).toBe(true);
  });

  test("네 번째 활동은 더하지 않고 3건까지라고 안내한다", async () => {
    renderPage();
    await ready();
    fireEvent.click(checkbox(/동아리 설문/));
    expect(checkbox(/동아리 설문/).checked).toBe(false);
    expect(screen.getByRole("status", { name: "선택 안내" })).toHaveTextContent(
      "3건까지",
    );
  });

  test("필터로 출처를 고르면 그 출처 카드만 남는다", async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "직접 입력 1" }));
    expect(
      screen.queryByRole("heading", { name: "버스 배차 간격 분석" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "동아리 설문 점검" }),
    ).toBeTruthy();
  });
});

describe("방향 어긋남과 과제", () => {
  test("방향이 과목과 어긋나면 경고 카드를 보여 주고 그대로 쓰기로 닫는다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({ direction: { mismatch: true } }),
    );
    renderPage();
    await ready();
    expect(
      screen.getByText("성장설계 방향이 이번 과목과 어긋나요"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "그대로 쓰기" }));
    expect(
      screen.queryByText("성장설계 방향이 이번 과목과 어긋나요"),
    ).toBeNull();
  });

  test("방향 해제는 세션의 연동을 끄고 목록을 다시 불러온다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({ direction: { mismatch: true } }),
    );
    updateMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, session: {} },
    });
    renderPage();
    await ready();
    pickListMock.mockResolvedValue(
      pickResponse({ growthApplied: false, direction: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "방향 해제" }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("s1", { growthApplied: false }),
    );
    await waitFor(() =>
      expect(screen.getByText("방향 없이 진행 중")).toBeTruthy(),
    );
    expect(refetchEntry).toHaveBeenCalled();
  });

  test("실행계획 과제가 남아 있으면 안내만 보여 준다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        planItem: {
          id: "p1",
          title: "통계 탐구 설계",
          description: null,
          axis: null,
          category: null,
        },
      }),
    );
    renderPage();
    await ready();
    expect(screen.getByText(/실행계획 과제가 남아 있어요/)).toBeTruthy();
    expect(screen.getByText(/통계 탐구 설계/)).toBeTruthy();
  });
});

describe("확정", () => {
  test("선택한 활동을 서버에 확정하고 분석 화면으로 이동한다", async () => {
    pickSelectMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        selection: { coreId: "a", supportIds: ["b", "c"] },
        coreMismatch: false,
        warnings: [],
        currentStep: 2,
      },
    });
    renderPage();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 3건 분석하기" }),
    );
    await waitFor(() =>
      expect(pickSelectMock).toHaveBeenCalledWith("s1", "a", ["b", "c"]),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/analysis"),
    );
    expect(refetchEntry).toHaveBeenCalled();
  });

  test("확정이 거절되면 이동하지 않고 서버 문구를 알린다", async () => {
    pickSelectMock.mockResolvedValue({
      kind: "error",
      status: 400,
      code: "UNAVAILABLE",
      message: "재료로 쓸 수 없는 활동이에요",
    });
    renderPage();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "선택한 3건 분석하기" }),
    );
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "재료로 쓸 수 없는 활동이에요",
      ),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test("이전은 기본 입력 화면을 이 세션으로 연다", async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/new?sessionId=s1");
  });

  test("분석을 시작한 세션이면 선택을 잠그고 분석 화면으로 안내한다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        currentStep: 3,
        selection: { coreId: "a", supportIds: [] },
        auto: null,
      }),
    );
    renderPage();
    expect(
      await screen.findByText(/분석을 시작한 뒤에는 활동을 바꿀 수 없어요/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /분석하기$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "분석 확인으로 가기" }));
    expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/analysis");
  });
});

describe("직접 입력", () => {
  test("직접 입력 버튼을 누르면 폼이 열린다", async () => {
    renderPage();
    await ready();
    expect(screen.queryByLabelText("활동명")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    expect(screen.getByLabelText("활동명")).toBeTruthy();
    expect(
      (screen.getByLabelText("과목 또는 영역") as HTMLInputElement).value,
    ).toBe("수학");
  });

  test("활동이 하나도 없으면 폼을 먼저 열어 둔다", async () => {
    pickListMock.mockResolvedValue(
      pickResponse({
        candidates: [],
        auto: {
          coreId: null,
          supportIds: [],
          coreMismatch: false,
          noneAboveThreshold: true,
        },
        sourceCounts: { performance: 0, deep: 0, manual: 0, total: 0 },
      }),
    );
    renderPage();
    expect(await screen.findByLabelText("활동명")).toBeTruthy();
  });

  test("manual 쿼리가 있으면 폼을 먼저 열어 둔다", async () => {
    renderPage("/app/selfeval/s/s1/activities?manual=1");
    expect(await screen.findByLabelText("활동명")).toBeTruthy();
  });

  test("활동명을 비우고 제출하면 오류를 보이고 요청하지 않는다", async () => {
    renderPage("/app/selfeval/s/s1/activities?manual=1");
    await screen.findByLabelText("활동명");
    fireEvent.click(
      screen.getByRole("button", { name: "이 활동으로 분석하기" }),
    );
    expect(screen.getByText("활동 이름을 입력해 주세요.")).toBeTruthy();
    expect(pickManualMock).not.toHaveBeenCalled();
  });

  test("제출하면 서버에 직접 입력을 보내고 분석 화면으로 이동한다", async () => {
    pickManualMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        activityRecordId: "m1",
        selection: { coreId: "m1", supportIds: [] },
        currentStep: 2,
      },
    });
    renderPage("/app/selfeval/s/s1/activities?manual=1");
    fireEvent.change(await screen.findByLabelText("활동명"), {
      target: { value: "직접 한 탐구" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "이 활동으로 분석하기" }),
    );
    await waitFor(() =>
      expect(pickManualMock).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          activityName: "직접 한 탐구",
          subjectOrArea: "수학",
          gradeLabel: "고2",
          semester: 1,
        }),
      ),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/app/selfeval/s/s1/analysis"),
    );
  });
});
