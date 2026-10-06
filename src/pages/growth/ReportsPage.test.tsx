import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchReportsMock } = vi.hoisted(() => ({ fetchReportsMock: vi.fn() }));

vi.mock("@/lib/growth/api", () => ({
  fetchReports: fetchReportsMock,
  fetchSurveyBootstrap: vi.fn(),
  fetchPlan: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthScreenStep: vi.fn(),
}));

import ReportsPage from "./ReportsPage";

function base(partial: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      items: [],
      open: null,
      archivedCount: 0,
      lastTerminal: null,
      ...partial,
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
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const completed = (id: string, issuedAt: string, extra = {}) => ({
  id,
  status: "completed",
  track: "인문",
  issuedAt,
  theme: `대주제 ${id}`,
  lastActivityAt: issuedAt,
  plan: null,
  ...extra,
});

beforeEach(() => fetchReportsMock.mockReset());
afterEach(cleanup);

describe("ReportsPage", () => {
  it("완료 회차가 없으면 빈 상태와 시작 버튼을 보여 준다", async () => {
    fetchReportsMock.mockResolvedValue(base());
    renderPage();
    expect(
      await screen.findByText("아직 완료한 리포트가 없어요"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/app/growth",
    );
  });

  it("완료 회차를 최신순으로 그리고 최신만 실행계획이 활성이다", async () => {
    fetchReportsMock.mockResolvedValue(
      base({
        items: [
          completed("old", "2026-03-10T00:00:00.000Z", {
            plan: { total: 5, done: 5 },
          }),
          completed("new", "2026-11-14T00:00:00.000Z", {
            plan: { total: 6, done: 2 },
          }),
        ],
      }),
    );
    renderPage();
    const links = await screen.findAllByRole("link", { name: "리포트 보기" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/app/growth/reports/new",
      "/app/growth/reports/old",
    ]);
    expect(
      screen.getByText("2026년 11월 14일 발행 리포트"),
    ).toBeInTheDocument();
    expect(screen.getByText("실행계획 6건 중 2건 완료")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "실행계획" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "실행계획" })).toHaveAttribute(
      "href",
      "/app/growth/plan",
    );
  });

  it("미완 회차가 있으면 이어서 하기 카드를 맨 위에 보여 준다", async () => {
    fetchReportsMock.mockResolvedValue(
      base({
        open: {
          id: "o",
          status: "in_progress",
          currentStep: 2,
          track: null,
          progress: Array.from({ length: 8 }, (_, i) => ({
            step: i + 1,
            label: "x",
            status: i < 2 ? "ok" : "pending",
            attempts: 0,
          })),
          nextStep: 3,
          terminal: null,
          lastActivityAt: "2026-10-01T00:00:00.000Z",
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("생성 중")).toBeInTheDocument();
    expect(screen.getByText("8단계 중 2단계 완료")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이어서 하기" })).toHaveAttribute(
      "href",
      "/app/growth/generate",
    );
  });

  it("종결 기록이 있으면 복구 안내와 새로 시작 버튼을 보여 준다", async () => {
    fetchReportsMock.mockResolvedValue(
      base({
        lastTerminal: {
          reportId: "t",
          reason: "검증 실패",
          at: "2026-09-30T00:00:00.000Z",
          step: 8,
        },
      }),
    );
    renderPage();
    expect(
      await screen.findByText("지난 회차는 생성에 실패해 이용권이 복구됐어요"),
    ).toBeInTheDocument();
    expect(screen.getByText(/검증 실패/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "새로 시작" })).toHaveAttribute(
      "href",
      "/app/growth",
    );
  });

  it("보관 회차 수는 0 이면 생략하고 있으면 표시한다", async () => {
    fetchReportsMock.mockResolvedValue(base({ archivedCount: 2 }));
    renderPage();
    expect(await screen.findByText("보관된 회차 2개")).toBeInTheDocument();
  });

  it("조회에 실패하면 다시 시도로 재조회한다", async () => {
    fetchReportsMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "실패",
    });
    renderPage();
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    fetchReportsMock.mockResolvedValue(base());
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.getByText("아직 완료한 리포트가 없어요"),
      ).toBeInTheDocument(),
    );
    expect(fetchReportsMock).toHaveBeenCalledTimes(2);
  });
});
