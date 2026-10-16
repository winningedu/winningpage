import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchEntryMock } = vi.hoisted(() => ({ fetchEntryMock: vi.fn() }));

vi.mock("@/lib/selfeval/api", () => ({
  fetchEntry: fetchEntryMock,
  fetchSessionDetail: vi.fn(),
  pickList: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "QA학생" }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ userId: "u1" }),
}));

// 공통 헤더와 로딩 오버레이는 라우터 데이터 API, 인증 컨텍스트에 묶여 있어 셸 구조 검증에 필요 없다.
vi.mock("@/components/Header", () => ({
  default: () => <header data-testid="site-header" />,
}));
vi.mock("@/components/ui/RouteLoadingOverlay", () => ({
  default: () => null,
}));

import SelfevalAppLayout from "./SelfevalAppLayout";
import { useSelfevalScreenStep } from "./SelfevalShellContext";

function StepOneChild() {
  useSelfevalScreenStep(1);
  return <div>child</div>;
}

beforeEach(() => {
  fetchEntryMock.mockReset();
  fetchEntryMock.mockResolvedValue({
    kind: "ok",
    data: {
      ok: true,
      entry: {
        quota: null,
        allowed: true,
        activityCount: 2,
        openSession: null,
        growth: null,
        profile: {
          gradeLabel: "고2",
          semester: 1,
          career: null,
          department: null,
          universities: [],
        },
        replyResent: 0,
        academicYearDefault: 2026,
      },
      sessions: [],
    },
  });
});

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/selfeval"]}>
        <Routes>
          <Route element={<SelfevalAppLayout />}>
            <Route path="/app/selfeval" element={<StepOneChild />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SelfevalAppLayout 렌더 스모크", () => {
  test("헤더, 사이드바, 페이지, 하단 고지를 함께 그린다", () => {
    renderLayout();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "꼭 알아 두세요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("진행단계")).toBeInTheDocument();
  });

  test("진입 정보가 오면 이름과 학년이 뜨고 시작이 현재 단계다", async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText("QA학생의 자기평가서")).toBeInTheDocument(),
    );
    expect(screen.getByText("고2")).toBeInTheDocument();
    const current = document.querySelector('li[aria-current="step"]');
    expect(current?.textContent).toContain("시작");
  });
});
