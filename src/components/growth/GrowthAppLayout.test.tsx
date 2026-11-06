import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { fetchSurveyBootstrapMock } = vi.hoisted(() => ({
  fetchSurveyBootstrapMock: vi.fn(),
}));

const siteState = vi.hoisted(() => ({ b2bMenu: false }));
vi.mock("@/config/site", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/site")>();
  return {
    ...actual,
    site: {
      ...actual.site,
      features: {
        ...actual.site.features,
        get b2bMenu() {
          return siteState.b2bMenu;
        },
      },
    },
  };
});

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
vi.mock("@/components/b2b/Header", () => ({
  default: () => <header data-testid="b2b-header" />,
}));
vi.mock("@/components/ui/RouteLoadingOverlay", () => ({
  default: () => null,
}));

import GrowthAppLayout from "./GrowthAppLayout";
import { useGrowthScreenStep } from "./GrowthShellContext";

// 시작 화면 대신 1단계만 올리는 더미 자식. 레이아웃 스모크는 페이지 내용에 의존하지 않는다.
function StepOneChild() {
  useGrowthScreenStep(1);
  return <div>child</div>;
}

afterEach(() => {
  siteState.b2bMenu = false;
});

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
            <Route path="/app/growth" element={<StepOneChild />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GrowthAppLayout 렌더 스모크", () => {
  test("b2bMenu 사이트는 B2B 헤더를 그린다", () => {
    siteState.b2bMenu = true;
    renderLayout();
    expect(screen.getByTestId("b2b-header")).toBeInTheDocument();
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
  });

  test("헤더, 사이드바, 페이지 타이틀, 하단 고지를 함께 그린다", async () => {
    renderLayout();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
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
