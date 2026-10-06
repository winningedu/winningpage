import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchSurveyBootstrapMock } = vi.hoisted(() => ({
  fetchSurveyBootstrapMock: vi.fn(),
}));

vi.mock("@/lib/growth/api", () => ({
  fetchSurveyBootstrap: fetchSurveyBootstrapMock,
  fetchReports: vi.fn(),
  fetchPlan: vi.fn(),
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

import StartPage from "@/pages/growth/StartPage";
import GrowthAppLayout from "./GrowthAppLayout";

beforeEach(() => {
  fetchSurveyBootstrapMock.mockReset();
  fetchSurveyBootstrapMock.mockResolvedValue({
    kind: "ok",
    data: {
      ok: true,
      openReport: null,
      entitlement: {
        hasAccess: true,
        quotaTotal: 3,
        quotaRemaining: 3,
        planEndsAt: null,
        planLabel: null,
      },
      reports: [],
      profile: { grade: "고2" },
    },
  });
});

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/app/growth"]}>
        <Routes>
          <Route element={<GrowthAppLayout />}>
            <Route path="/app/growth" element={<StartPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GrowthAppLayout 렌더 스모크", () => {
  test("헤더, 사이드바, 페이지 타이틀, 하단 고지를 함께 그린다", async () => {
    renderLayout();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "위닝 성장설계" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "꼭 알아 두세요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("진행단계")).toBeInTheDocument();
  });

  test("부트스트랩이 오면 사이드바에 이름과 학년이 뜨고 시작이 현재 단계다", async () => {
    renderLayout();
    await waitFor(() =>
      expect(screen.getByText("QA학생의 성장설계")).toBeInTheDocument(),
    );
    expect(screen.getByText("고2")).toBeInTheDocument();
    const current = document.querySelector('li[aria-current="step"]');
    expect(current?.textContent).toContain("시작");
  });
});
