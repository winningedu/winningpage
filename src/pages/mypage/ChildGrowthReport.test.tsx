import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fetchDetailMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fetchDetailMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "parent1" }),
}));
vi.mock("@/lib/growth/api", () => ({
  fetchChildReports: vi.fn(),
  fetchChildReportDetail: fetchDetailMock,
}));

import ChildGrowthReport from "./ChildGrowthReport";

const CHILD = "c1";

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
        range: null,
        omitted: null,
        narrative: { theme: "대주제 문장", subthemes: [] },
        overview: [],
        consistency: null,
        axes: null,
        sections: [],
        excludedSectionIds: ["D", "E", "F", "G"],
        planItems: [
          {
            id: "p1",
            title: "독서 활동",
            program: "school",
            priority: "required",
            status: "done",
            deadline: "2026-11-30",
          },
          {
            id: "p2",
            title: "심화탐구 시작",
            program: "deep",
            priority: "recommended",
            status: "pending",
            deadline: null,
          },
        ],
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
      <MemoryRouter initialEntries={[`/mypage/children/${CHILD}/growth/r1`]}>
        <Routes>
          <Route
            path="/mypage/children/:childId/growth/:reportId"
            element={<ChildGrowthReport />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ChildGrowthReport", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fetchDetailMock.mockReset();
    rpcMock.mockResolvedValue({
      data: [
        {
          student_profile_id: CHILD,
          student_name: "김하나",
          link_status: "approved",
        },
      ],
      error: null,
    });
  });
  afterEach(cleanup);

  it("라우트 파라미터로 상세를 조회하고 parentView 로 렌더한다", async () => {
    fetchDetailMock.mockResolvedValue(ok());
    renderPage();
    expect(await screen.findByText("대주제 문장")).toBeVisible();
    expect(fetchDetailMock).toHaveBeenCalledWith(CHILD, "r1");
    expect(screen.getByText("김하나 학생의 성장설계 리포트")).toBeVisible();
    expect(screen.getByText("2026년 11월 14일 발행")).toBeVisible();
    // 제외 안내는 ReportBody 한 곳에서만 보인다.
    const notices = screen.getAllByText(/성적과 관련된 항목은/);
    expect(notices).toHaveLength(1);
    expect(screen.getByRole("link", { name: /목록으로/ })).toHaveAttribute(
      "href",
      `/mypage/children/${CHILD}/growth`,
    );
  });

  it("실행계획을 읽기 전용으로 보여주고 체크 컨트롤이 없다", async () => {
    fetchDetailMock.mockResolvedValue(ok());
    renderPage();
    const plan = await screen.findByRole("region", { name: "실행계획" });
    expect(within(plan).getByText("독서 활동")).toBeVisible();
    expect(
      within(plan).getByText("학교, 반드시, 마감 11월 30일"),
    ).toBeVisible();
    expect(within(plan).getByText("위닝 심화탐구, 있으면 좋음")).toBeVisible();
    expect(within(plan).getByText("완료")).toBeVisible();
    expect(within(plan).getByText("진행 중")).toBeVisible();
    expect(within(plan).queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("실행계획 1/2 완료")).toBeVisible();
  });

  it("실행계획이 없으면 실행계획 영역을 만들지 않는다", async () => {
    fetchDetailMock.mockResolvedValue(ok({ planItems: [] }));
    renderPage();
    await screen.findByText("대주제 문장");
    expect(screen.queryByRole("region", { name: "실행계획" })).toBeNull();
  });

  it("학부모가 아니면 조회 없이 미연결 안내를 보여준다", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    renderPage();
    expect(await screen.findByText("연결된 자녀가 아니에요.")).toBeVisible();
    expect(fetchDetailMock).not.toHaveBeenCalled();
  });

  it("서버 403 은 미연결 안내, 404 는 찾을 수 없음 안내다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NOT_LINKED",
      message: "x",
    });
    renderPage();
    expect(await screen.findByText("연결된 자녀가 아니에요.")).toBeVisible();
    cleanup();

    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "REPORT_NOT_FOUND",
      message: "x",
    });
    renderPage();
    expect(await screen.findByText("리포트를 찾을 수 없어요.")).toBeVisible();
  });

  it("그 밖의 오류는 다시 시도 버튼을 보여준다", async () => {
    fetchDetailMock.mockResolvedValue({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "x",
    });
    renderPage();
    expect(
      await screen.findByRole("button", { name: "다시 시도" }),
    ).toBeVisible();
  });
});
