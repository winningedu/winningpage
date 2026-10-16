import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TopicView } from "@/lib/inquiry/api";

const { shellMock, recommendMock, planMock } = vi.hoisted(() => ({
  shellMock: vi.fn(),
  recommendMock: vi.fn(),
  planMock: vi.fn(),
}));

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryShell: shellMock,
  useInquiryScreenStep: vi.fn(),
}));
vi.mock("@/lib/inquiry/api", () => ({
  recommendTopics: recommendMock,
  createPlanReport: planMock,
}));
vi.mock("@/components/inquiry/StepGuardCard", () => ({
  default: (p: { title: string }) => <div data-testid="guard">{p.title}</div>,
}));

import TopicsPage from "./TopicsPage";

function topic(idx: 1 | 2 | 3, over: Partial<TopicView> = {}): TopicView {
  return {
    id: `t${idx}`,
    round: 1,
    idx,
    linkKind: "followup",
    linkageType: "direct",
    fit: "match",
    selected: false,
    detail: {
      title: `주제 ${idx}`,
      subtitle: "부제",
      question: "질문",
      hypothesis1: "가설1",
      hypothesis2: "가설2",
      verifiability: "검증",
      concepts: [],
      methodSteps: [],
      sourceCandidates: [],
      reason: "이유",
      careerLink: "진로",
      nextDirection: "다음",
      path: { from: "출발", via: "연계", to: "질문" },
      fitReason: null,
      followUpQuestions: [],
    },
    ...over,
  };
}

const SESSION = {
  id: "s1",
  status: "in_progress",
  currentStep: 2,
  topicRoundCount: 1,
  selectedTopicId: null,
  designReportId: null,
};

function shell(over: Record<string, unknown> = {}) {
  return {
    session: SESSION,
    quota: { quotaTotal: 10, quotaUsed: 3, quotaRemaining: 7 },
    topics: [topic(1), topic(2), topic(3)],
    assets: [{ reliability: "A" }],
    gradeNote: "고2 안내",
    isBootstrapLoading: false,
    applyBootstrap: vi.fn(),
    refetchBootstrap: vi.fn(),
    ...over,
  };
}

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/app/inquiry/topics", state }]}>
      <Routes>
        <Route path="/app/inquiry/topics" element={<TopicsPage />} />
        <Route path="/app/inquiry/design" element={<div>설계 화면</div>} />
        <Route path="/app/inquiry" element={<div>시작 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CONFIRM = "선택한 주제로 설계 리포트 만들기";

describe("TopicsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellMock.mockReturnValue(shell());
  });

  test("세션이 없으면 가드 카드만 그리고 호출하지 않는다", () => {
    shellMock.mockReturnValue(shell({ session: null, topics: [] }));
    renderPage();
    expect(screen.getByTestId("guard").textContent).toBe("아직 세션이 없어요");
    expect(recommendMock).not.toHaveBeenCalled();
  });

  test("주제가 있고 startRecommend 가 없으면 호출 없이 카드 3장과 안내 바를 그린다", () => {
    renderPage();
    expect(recommendMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      screen.getByText("주제 추천을 1회 썼어요. 남은 이용 횟수 7 / 10회"),
    ).toBeTruthy();
    expect(screen.getByText("고2 안내")).toBeTruthy();
  });

  test("startRecommend 상태로 들어오면 즉시 추천을 부르고 응답을 셸에 반영한다", async () => {
    const applyBootstrap = vi.fn();
    shellMock.mockReturnValue(shell({ topics: [], applyBootstrap }));
    const topics = [topic(1), topic(2), topic(3)];
    recommendMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        round: 1,
        topics,
        charged: true,
        quota: { quotaTotal: 10, quotaUsed: 4, quotaRemaining: 6 },
        attempts: 1,
        gradeNote: "새 안내",
        session: { ...SESSION, topicRoundCount: 2, id: "s1" },
      },
    });
    renderPage({ startRecommend: true });
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(applyBootstrap).toHaveBeenCalled());
    expect(recommendMock).toHaveBeenCalledWith({ sessionId: "s1" });
    const arg = applyBootstrap.mock.calls[0]?.[0];
    expect(arg.topics).toBe(topics);
    expect(arg.quota.quotaRemaining).toBe(6);
    expect(arg.gradeNote).toBe("새 안내");
    expect(arg.session.topicRoundCount).toBe(2);
  });

  test("charged 가 false 면 차감 안내를 보여 준다", async () => {
    shellMock.mockReturnValue(shell({ topics: [] }));
    recommendMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        round: 1,
        topics: [topic(1), topic(2), topic(3)],
        charged: false,
        quota: null,
        attempts: 1,
        gradeNote: null,
        session: SESSION,
      },
    });
    renderPage({ startRecommend: true });
    expect(
      await screen.findByText(
        "이용권 차감이 되지 않았어요. 설계 리포트 단계에서 다시 확인해요.",
      ),
    ).toBeTruthy();
  });

  test("설계 호출 실패는 설계 리포트 실패 카드를 그린다", async () => {
    planMock.mockResolvedValue({
      kind: "error",
      status: 502,
      code: "MODEL_UPSTREAM_FAILED",
      message: "m",
      extra: { attempts: 2 },
    });
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "이 주제로 확정",
      })[0] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(
      await screen.findByText("설계 리포트를 만들지 못했어요"),
    ).toBeTruthy();
  });

  test("422 실패는 실패 카드를 그리고 다시 시도로 재호출한다", async () => {
    shellMock.mockReturnValue(shell({ topics: [] }));
    recommendMock.mockResolvedValueOnce({
      kind: "error",
      status: 422,
      code: "GENERATION_VALIDATION_FAILED",
      message: "m",
      extra: { attempts: 2 },
    });
    renderPage({ startRecommend: true });
    expect(await screen.findByText("주제를 만들지 못했어요")).toBeTruthy();
    recommendMock.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(recommendMock).toHaveBeenCalledTimes(2));
  });

  test("종결 응답은 종결 카드와 처음부터 다시 시작 버튼을 그린다", async () => {
    shellMock.mockReturnValue(shell({ topics: [] }));
    recommendMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "ATTEMPTS_EXHAUSTED",
      message: "m",
      extra: { terminal: true },
    });
    renderPage({ startRecommend: true });
    fireEvent.click(
      await screen.findByRole("button", { name: "처음부터 다시 시작" }),
    );
    expect(await screen.findByText("시작 화면")).toBeTruthy();
  });

  test("403 은 이용권 보기 링크를 그린다", async () => {
    shellMock.mockReturnValue(shell({ topics: [] }));
    recommendMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "m",
    });
    renderPage({ startRecommend: true });
    const link = await screen.findByRole("link", { name: "이용권 보기" });
    expect(link.getAttribute("href")).toBe("/pricing?service=inquiry");
  });

  test("GENERATION_RUNNING 은 3초 뒤 같은 요청을 다시 보낸다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      shellMock.mockReturnValue(shell({ topics: [] }));
      recommendMock
        .mockResolvedValueOnce({
          kind: "error",
          status: 409,
          code: "GENERATION_RUNNING",
          message: "m",
        })
        .mockReturnValue(new Promise(() => {}));
      renderPage({ startRecommend: true });
      await waitFor(() => expect(recommendMock).toHaveBeenCalledTimes(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(recommendMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("예비 주제면 안내 배너와 확인 질문을 그리고 정보 입력으로 보낸다", async () => {
    const first = topic(1, { linkageType: "interest_based_provisional" });
    first.detail.followUpQuestions = ["질문 A", "질문 B", "질문 C"];
    shellMock.mockReturnValue(shell({ topics: [first, topic(2), topic(3)] }));
    renderPage();
    expect(screen.getByText("질문 A")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "활동 적으러 정보 입력으로" }),
    );
    expect(await screen.findByText("시작 화면")).toBeTruthy();
  });

  test("주제를 고르지 않고 설계 만들기를 누르면 안내만 나오고 호출하지 않는다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(
      screen.getByText("주제를 하나 골라야 설계 리포트를 만들 수 있어요"),
    ).toBeTruthy();
    expect(planMock).not.toHaveBeenCalled();
  });

  test("주제를 고르고 설계를 만들면 plan-report 호출 뒤 설계 화면으로 간다", async () => {
    const applyBootstrap = vi.fn();
    shellMock.mockReturnValue(shell({ applyBootstrap }));
    planMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        design: {},
        topic: topic(2),
        attempts: 1,
        result: "ok",
        designReportId: "d1",
        session: { ...SESSION, selectedTopicId: "t2", designReportId: "d1" },
      },
    });
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "이 주제로 확정",
      })[1] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(await screen.findByText("설계 화면")).toBeTruthy();
    expect(planMock).toHaveBeenCalledWith({ sessionId: "s1", topicId: "t2" });
    expect(applyBootstrap.mock.calls[0]?.[0].session.designReportId).toBe("d1");
  });

  test("TOPIC_NOT_IN_ROUND 는 선택을 풀고 안내한다", async () => {
    planMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "TOPIC_NOT_IN_ROUND",
      message: "m",
    });
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "이 주제로 확정",
      })[0] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(
      await screen.findByText(
        "고른 주제가 최신 추천 목록에 없어요. 다시 골라 주세요.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "선택됨" })).toBeNull();
  });

  test("SESSION_LOCKED 는 설계 화면으로 이동한다", async () => {
    planMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "SESSION_LOCKED",
      message: "m",
    });
    renderPage();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "이 주제로 확정",
      })[0] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(await screen.findByText("설계 화면")).toBeTruthy();
  });

  test("다시 추천받기는 남은 횟수를 보여 주고 소진되면 비활성이다", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "다시 추천받기(남은 3 / 3)" }),
    ).toBeTruthy();
  });

  test("라운드를 모두 쓰면 다시 추천받기가 비활성이다", () => {
    shellMock.mockReturnValue(
      shell({ session: { ...SESSION, topicRoundCount: 4 } }),
    );
    renderPage();
    const btn = screen.getByRole("button", {
      name: "다시 추천받기(남은 0 / 3)",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test("다시 추천받기는 seedTopic 없이 호출하고, 직접 주제는 seedTopic 을 넘긴다", async () => {
    recommendMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "다시 추천받기(남은 3 / 3)" }),
    );
    await waitFor(() =>
      expect(recommendMock).toHaveBeenCalledWith({ sessionId: "s1" }),
    );
  });

  test("직접 주제 입력은 seedTopic 으로 추천을 부른다", async () => {
    recommendMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText("직접 주제 한 줄"), {
      target: { value: "꿀벌" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "이 주제로 다시 추천받기" }),
    );
    await waitFor(() =>
      expect(recommendMock).toHaveBeenCalledWith({
        sessionId: "s1",
        seedTopic: "꿀벌",
      }),
    );
  });

  test("ROUND_LIMIT 응답이면 재추천 버튼이 막히고 안내가 나온다", async () => {
    recommendMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "ROUND_LIMIT",
      message: "m",
    });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "다시 추천받기(남은 3 / 3)" }),
    );
    expect(
      await screen.findByText("재추천을 모두 썼어요. 이 안에서 골라 주세요."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "다시 추천받기(남은 3 / 3)",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
