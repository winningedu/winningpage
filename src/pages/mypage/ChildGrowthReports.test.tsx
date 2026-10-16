import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fetchReportsMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fetchReportsMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "parent1" }),
}));
vi.mock("@/lib/growth/api", () => ({
  fetchChildReports: fetchReportsMock,
  fetchChildReportDetail: vi.fn(),
}));

import ChildGrowthReports from "./ChildGrowthReports";

const CHILD = "c1";

function link(over: Record<string, unknown> = {}) {
  return {
    data: [
      {
        student_profile_id: CHILD,
        student_name: "김하나",
        link_status: "approved",
        ...over,
      },
    ],
    error: null,
  };
}

function item(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    status: "completed",
    track: "regular",
    issuedAt: "2026-11-14T00:00:00Z",
    theme: "생명과학 연구자",
    lastActivityAt: "2026-11-14T00:00:00Z",
    plan: { total: 5, done: 2 },
    ...over,
  };
}

function renderPage(path = `/mypage/children/${CHILD}/growth`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/mypage/children/:childId/growth"
            element={<ChildGrowthReports />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ChildGrowthReports", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fetchReportsMock.mockReset();
  });
  afterEach(cleanup);

  it("라우트 파라미터 childId 로 목록을 조회하고 카드를 그린다", async () => {
    rpcMock.mockResolvedValue(link());
    fetchReportsMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, items: [item()], child: { id: CHILD, name: "김하나" } },
    });
    renderPage();
    expect(await screen.findByText("생명과학 연구자")).toBeInTheDocument();
    expect(fetchReportsMock).toHaveBeenCalledWith(CHILD);
    expect(screen.getByText(/김하나 학생의 성장설계 리포트/)).toBeVisible();
    expect(screen.getByText("2026년 11월 14일 발행")).toBeVisible();
    expect(screen.getByText("실행계획 2/5 진행")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /생명과학 연구자/ }),
    ).toHaveAttribute("href", `/mypage/children/${CHILD}/growth/r1`);
  });

  it("완료 회차가 없으면 빈 상태를 보여준다", async () => {
    rpcMock.mockResolvedValue(link());
    fetchReportsMock.mockResolvedValue({
      kind: "ok",
      data: { ok: true, items: [], child: { id: CHILD, name: "김하나" } },
    });
    renderPage();
    expect(
      await screen.findByText("아직 완료한 리포트가 없어요"),
    ).toBeVisible();
  });

  it("학부모가 아니거나 자녀가 목록에 없으면 조회하지 않고 안내한다", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    renderPage();
    expect(await screen.findByText("연결된 자녀가 아니에요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "마이페이지로" })).toBeVisible();
    expect(fetchReportsMock).not.toHaveBeenCalled();
  });

  it("승인되지 않은 연결은 자녀 미연결로 본다", async () => {
    rpcMock.mockResolvedValue(link({ link_status: "pending" }));
    renderPage();
    expect(await screen.findByText("연결된 자녀가 아니에요.")).toBeVisible();
    expect(fetchReportsMock).not.toHaveBeenCalled();
  });

  it("서버가 403 NOT_LINKED 를 주면 미연결 안내로 바꾼다", async () => {
    rpcMock.mockResolvedValue(link());
    fetchReportsMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NOT_LINKED",
      message: "x",
    });
    renderPage();
    expect(await screen.findByText("연결된 자녀가 아니에요.")).toBeVisible();
  });

  it("그 밖의 오류는 다시 시도 버튼을 보여주고 누르면 재조회한다", async () => {
    rpcMock.mockResolvedValue(link());
    fetchReportsMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    fetchReportsMock.mockResolvedValueOnce({
      kind: "ok",
      data: { ok: true, items: [item()], child: { id: CHILD, name: null } },
    });
    renderPage();
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    retry.click();
    await waitFor(() =>
      expect(screen.getByText("생명과학 연구자")).toBeVisible(),
    );
    expect(screen.getByText(/김하나 학생의 성장설계 리포트/)).toBeVisible();
  });
});
