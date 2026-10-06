import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { shellMock, stepMock, fetchDetailMock, finalizeMock, refetchMock } =
  vi.hoisted(() => ({
    shellMock: vi.fn(),
    stepMock: vi.fn(),
    fetchDetailMock: vi.fn(),
    finalizeMock: vi.fn(),
    refetchMock: vi.fn(),
  }));

vi.mock("@/components/inquiry/InquiryShellContext", () => ({
  useInquiryShell: shellMock,
  useInquiryScreenStep: stepMock,
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/lib/inquiry/api", () => ({
  fetchSessionDetail: fetchDetailMock,
  finalizeSession: finalizeMock,
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title, subcopy }: { title: string; subcopy?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subcopy}</p>
    </header>
  ),
}));

import FinalizePage from "./FinalizePage";

function session(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    status: "in_progress",
    currentStep: 5,
    selectedTopicId: "t1",
    designReportId: "d1",
    latestEvaluationId: "e1",
    evaluationCount: 1,
    ...over,
  };
}

function preview(over: Record<string, unknown> = {}) {
  return {
    summary: {
      topic: "내 주제",
      subject: "생명과학",
      linkage: "출발 활동 (후속형)",
      concepts: ["온습도지수"],
      limitation: "표본이 적어요",
      score: 91.3,
      label: "ready_with_minor_edits",
      planItemTitle: null,
    },
    fields: {
      topic: "내 주제",
      concept: "온습도지수",
      method: "방법 문단",
      result: "결과 문단",
      limitation: "표본이 적어요",
      numbers: ["3.2%"],
      sources: ["기상청"],
    },
    missing: [],
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}, sess = session()) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: sess,
      finalizePreview: preview(),
      final: null,
      ...over,
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FinalizePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SUBMIT = "확정하고 활동 기록에 적립";

beforeEach(() => {
  stepMock.mockClear();
  fetchDetailMock.mockReset();
  finalizeMock.mockReset();
  refetchMock.mockReset();
  refetchMock.mockResolvedValue(undefined);
  fetchDetailMock.mockResolvedValue(detail());
  shellMock.mockReturnValue({
    session: session(),
    isBootstrapLoading: false,
    refetchBootstrap: refetchMock,
    applyBootstrap: vi.fn(),
  });
});
afterEach(cleanup);

describe("FinalizePage 화면", () => {
  test("6단계를 올리고 제목, 부제, 표, 폼을 그린다", async () => {
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(6);
    expect(
      screen.getByRole("heading", { name: "이 탐구를 다음 탐구의 재료로" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "확정하면 이 심화탐구가 활동 기록에 쌓여요. 여기서 남긴 한계와 후속 탐구가 다음 심화탐구의 출발점이 돼요",
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole("table", { name: "적립될 내용" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "방법" })).toHaveValue(
      "방법 문단",
    );
  });

  test("다시 평가 링크는 작성 화면으로 간다", async () => {
    renderPage();
    expect(
      await screen.findByRole("link", { name: "더 보완하고 다시 평가" }),
    ).toHaveAttribute("href", "/app/inquiry/write");
  });
});

describe("FinalizePage 제출", () => {
  test("제출하면 수정한 7항목을 보내고 결과 카드를 그린다", async () => {
    finalizeMock.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        status: "completed",
        activityRecordId: "a1",
        finalReportId: "f1",
        replySent: true,
      },
    });
    renderPage();
    const method = await screen.findByRole("textbox", { name: "방법" });
    fireEvent.change(method, { target: { value: "고친 방법" } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(
      await screen.findByText("성장설계 실행계획 과제를 완료로 알렸어요"),
    ).toBeVisible();
    expect(finalizeMock).toHaveBeenCalledWith({
      sessionId: "s1",
      fields: {
        topic: "내 주제",
        concept: "온습도지수",
        method: "고친 방법",
        result: "결과 문단",
        limitation: "표본이 적어요",
        numbers: ["3.2%"],
        sources: ["기상청"],
      },
    });
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: SUBMIT }),
    ).not.toBeInTheDocument();
  });

  test("빈 항목이 있으면 aria-disabled 이고 호출하지 않는다", async () => {
    renderPage();
    const limitation = await screen.findByRole("textbox", { name: "한계" });
    fireEvent.change(limitation, { target: { value: "" } });
    const button = screen.getByRole("button", { name: SUBMIT });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("직접 적어 주세요. 비워 두면 적립할 수 없어요")
        .length,
    ).toBeGreaterThan(0);
  });

  test("한계가 비어 내려오면 처음부터 제출이 막혀 있다", async () => {
    fetchDetailMock.mockResolvedValue(
      detail({
        finalizePreview: preview({
          summary: { ...preview().summary, limitation: "" },
          fields: { ...preview().fields, limitation: "" },
          missing: ["limitation"],
        }),
      }),
    );
    renderPage();
    expect(
      await screen.findByText("추출하지 못했어요. Ⅵ 한계 절이 비어 있어요"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: SUBMIT })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("409 STEP_ORDER 는 평가로 안내한다", async () => {
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "STEP_ORDER",
      message: "x",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: SUBMIT }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "평가를 먼저 마쳐야 해요",
    );
    expect(screen.getByRole("link", { name: "평가 리포트로" })).toHaveAttribute(
      "href",
      "/app/inquiry/evaluate",
    );
  });

  test("403 NO_ENTITLEMENT 는 이용권 보기 링크", async () => {
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "x",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: SUBMIT }));
    expect(
      await screen.findByRole("link", { name: "이용권 보기" }),
    ).toHaveAttribute("href", "/pricing?service=inquiry");
  });

  test("400 INVALID_BODY 는 비어 있는 항목 이름을 알린다", async () => {
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 400,
      code: "INVALID_BODY",
      message: "x",
      extra: { missing: ["limitation", "method"] },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: SUBMIT }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "비어 있는 항목: 한계, 방법",
    );
  });

  test("500 은 일반 안내 후 다시 제출할 수 있다", async () => {
    finalizeMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: SUBMIT }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "적립하지 못했어요",
    );
    expect(screen.getByRole("button", { name: SUBMIT })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("FinalizePage 이미 완료된 세션", () => {
  test("completed 세션이면 폼 대신 결과 카드를 그린다", async () => {
    const done = session({ status: "completed" });
    shellMock.mockReturnValue({
      session: done,
      isBootstrapLoading: false,
      refetchBootstrap: refetchMock,
      applyBootstrap: vi.fn(),
    });
    fetchDetailMock.mockResolvedValue(detail({}, done));
    renderPage();
    expect(await screen.findByText(/활동 기록에 적립됐어요\./)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: SUBMIT }),
    ).not.toBeInTheDocument();
  });
});
