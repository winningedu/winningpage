import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { shellMock, stepMock, fetchDetailMock } = vi.hoisted(() => ({
  shellMock: vi.fn(),
  stepMock: vi.fn(),
  fetchDetailMock: vi.fn(),
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
}));
vi.mock("@/components/goal/GoalPageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import EvaluatePage from "./EvaluatePage";

const IDS = [
  "linkage",
  "question",
  "method",
  "evidence",
  "conclusion",
  "structure",
] as const;

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

function detail(evaluationCount = 1) {
  return {
    kind: "ok",
    data: {
      ok: true,
      session: session({ evaluationCount }),
      evaluation: {
        id: "e1",
        revision: 1,
        createdAt: "2026-10-06T00:00:00Z",
        total: 88,
        label: "revision_needed",
        items: IDS.map((id) => ({
          id,
          level: 4,
          score: 5,
          met: ["a"],
          unmet: [],
          evidence: "",
          capReason: null,
        })),
        coreErrors: [],
        fixFirst: [],
        mustFix: [],
        checklist: [],
        sources: [],
        placeholders: {},
      },
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
        <EvaluatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stepMock.mockClear();
  fetchDetailMock.mockReset();
  fetchDetailMock.mockResolvedValue(detail());
  shellMock.mockReturnValue({ session: session(), isBootstrapLoading: false });
});
afterEach(cleanup);

describe("EvaluatePage", () => {
  test("5단계를 셸에 올리고 평가 본문을 그린다", async () => {
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(5);
    expect(await screen.findByRole("region", { name: "총점" })).toBeVisible();
    expect(screen.getByText("수정 필요")).toBeVisible();
    expect(fetchDetailMock).toHaveBeenCalledWith("s1");
  });

  test("작성 화면과 확정 화면으로 가는 링크가 있다", async () => {
    renderPage();
    await screen.findByRole("region", { name: "총점" });
    expect(
      screen.getByRole("link", { name: "작성 화면으로 돌아가기" }),
    ).toHaveAttribute("href", "/app/inquiry/write");
    expect(
      screen.getByRole("link", { name: "확정하고 적립하기" }),
    ).toHaveAttribute("href", "/app/inquiry/finalize");
  });

  test("남은 재평가 횟수를 안내한다", async () => {
    renderPage();
    expect(
      await screen.findByText(
        "다시 평가하려면 작성 화면에서 고친 뒤 제출해요. 남은 재평가 3 / 3",
      ),
    ).toBeVisible();
  });

  test("재평가를 모두 썼으면 더 평가할 수 없다고 안내한다", async () => {
    fetchDetailMock.mockResolvedValue(detail(4));
    renderPage();
    expect(
      await screen.findByText(
        "재평가를 모두 사용했어요. 이 평가로 확정하거나 작성 화면에서 내용을 확인해 주세요. 남은 재평가 0 / 3",
      ),
    ).toBeVisible();
  });

  test("조회가 실패하면 오류 안내와 다시 시도 버튼", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  });

  test("평가 리포트가 없는 세션이면 안내 카드가 대신 보인다", () => {
    shellMock.mockReturnValue({
      session: session({ latestEvaluationId: null, currentStep: 4 }),
      isBootstrapLoading: false,
    });
    renderPage();
    expect(
      screen.getByRole("heading", { name: "아직 평가할 보고서가 없어요" }),
    ).toBeVisible();
    expect(fetchDetailMock).not.toHaveBeenCalled();
  });
});
