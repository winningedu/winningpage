import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDetailMock, stepMock, shellState } = vi.hoisted(() => ({
  fetchDetailMock: vi.fn(),
  stepMock: vi.fn(),
  shellState: { latestCompletedReportId: "r1" as string | null },
}));

vi.mock("@/lib/growth/api", () => ({
  fetchReportDetail: fetchDetailMock,
  fetchReports: vi.fn(),
  fetchSurveyBootstrap: vi.fn(),
  fetchPlan: vi.fn(),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));
vi.mock("@/components/growth/GrowthShellContext", () => ({
  useGrowthScreenStep: stepMock,
  useGrowthShell: () => shellState,
}));

import ReportPage from "./ReportPage";

function ok(report: Record<string, unknown> = {}) {
  return {
    kind: "ok",
    data: {
      ok: true,
      report: {
        id: "r1",
        status: "completed",
        track: "regular",
        issuedAt: "2026-11-14T00:00:00Z",
        currentStep: 8,
        progress: [],
        range: {
          semesters: [],
          description: "1학년 1학기부터 2학년 2학기까지",
        },
        omitted: null,
        narrative: { theme: "대주제 문장", subthemes: [] },
        overview: [],
        consistency: null,
        axes: null,
        sections: [],
        excludedSectionIds: [],
        planItems: [],
        lastActivityAt: "2026-11-14T00:00:00Z",
        ...report,
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
      <MemoryRouter initialEntries={["/app/growth/reports/r1"]}>
        <Routes>
          <Route
            path="/app/growth/reports/:reportId"
            element={<ReportPage />}
          />
          <Route path="/app/growth/generate" element={<p>생성 화면</p>} />
          <Route path="/app/growth/reports" element={<p>목록 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportPage", () => {
  beforeEach(() => {
    fetchDetailMock.mockReset();
    shellState.latestCompletedReportId = "r1";
  });
  afterEach(cleanup);

  it("5단계로 알리고 대주제를 제목으로 쓴다", async () => {
    fetchDetailMock.mockResolvedValue(ok());
    renderPage();
    expect(stepMock).toHaveBeenCalledWith(5);
    expect(
      await screen.findByRole("heading", { level: 1, name: "대주제 문장" }),
    ).toBeInTheDocument();
    expect(fetchDetailMock).toHaveBeenCalledWith("r1");
    expect(
      screen.getByText(/1학년 1학기부터 2학년 2학기까지/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "실행계획 보기" })).toHaveLength(
      2,
    );
    expect(screen.getByRole("link", { name: "지난 리포트" })).toHaveAttribute(
      "href",
      "/app/growth/reports",
    );
  });

  it("대주제가 없으면 기본 제목을 쓴다", async () => {
    fetchDetailMock.mockResolvedValue(ok({ narrative: null }));
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "성장설계 리포트" }),
    ).toBeInTheDocument();
  });

  it("409 REPORT_NOT_COMPLETED 면 생성 화면으로 보낸다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "REPORT_NOT_COMPLETED",
      message: "x",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("생성 화면")).toBeInTheDocument(),
    );
  });

  it("404 면 목록으로 보낸다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "REPORT_NOT_FOUND",
      message: "x",
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("목록 화면")).toBeInTheDocument(),
    );
  });

  it("그 밖의 실패는 다시 시도 버튼을 보여 준다", async () => {
    fetchDetailMock.mockResolvedValue({ kind: "timeout" });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "불러오지 못했어요",
    );
    expect(
      screen.getByRole("button", { name: "다시 시도" }),
    ).toBeInTheDocument();
  });

  it("최신 완료 회차가 아니면 실행계획 보기 대신 안내를 보여 준다", async () => {
    shellState.latestCompletedReportId = "r2";
    fetchDetailMock.mockResolvedValue(ok());
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "대주제 문장" });
    expect(screen.queryByRole("link", { name: "실행계획 보기" })).toBeNull();
    expect(
      screen.getByText("실행계획은 최신 회차에서 볼 수 있어요"),
    ).toBeInTheDocument();
  });

  it("최신 회차를 아직 모를 때는 버튼을 숨기지 않는다", async () => {
    shellState.latestCompletedReportId = null;
    fetchDetailMock.mockResolvedValue(ok());
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "대주제 문장" });
    expect(screen.getAllByRole("link", { name: "실행계획 보기" })).toHaveLength(
      2,
    );
  });
});
