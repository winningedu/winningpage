import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import PerformanceAppLayout from "./PerformanceAppLayout";

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
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("react-router", () => ({
  Outlet: () => <div data-testid="scroller" />,
}));
vi.mock("@/components/app-shell/AppShellSidebar", () => ({
  AppShellSidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AppShellSidebarTrigger: () => null,
}));
vi.mock("@/components/Header", () => ({
  default: () => <header data-testid="site-header" />,
}));
vi.mock("@/components/b2b/Header", () => ({
  default: ({ showHome }: { showHome?: boolean }) => (
    <header
      data-testid="b2b-header"
      data-show-home={String(Boolean(showHome))}
    />
  ),
}));
vi.mock("@/components/ui/RouteLoadingOverlay", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/context/PerformanceShellContext", () => ({
  PerformanceShellProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  usePerformanceShell: () => ({
    stepStates: [],
    quotaBannerVisible: false,
    sessionGradeLabel: null,
  }),
}));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ session: null, userId: null }),
}));
vi.mock("@/context/ToastContext", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/queryClient", () => ({
  performanceBootstrapQueryOptions: () => ({}),
}));
vi.mock("./PerformanceSidebar", () => ({ default: () => null }));
vi.mock("./quota/QuotaExhaustedBanner", () => ({ default: () => null }));

function scrollTo(top: number) {
  const scroller = screen.getByTestId("scroller");
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
}

const titleBand = () =>
  screen.getByRole("heading", { level: 1 }).closest("[data-condensed]");

afterEach(() => {
  siteState.b2bMenu = false;
});

describe("PerformanceAppLayout header", () => {
  test("b2bMenu 사이트는 B2B 헤더를 그린다", () => {
    siteState.b2bMenu = true;
    render(<PerformanceAppLayout />);
    expect(screen.getByTestId("b2b-header")).toBeInTheDocument();
    expect(screen.getByTestId("b2b-header")).toHaveAttribute(
      "data-show-home",
      "true",
    );
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
  });

  test("위닝은 기존 헤더를 그대로 그린다", () => {
    render(<PerformanceAppLayout />);
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.queryByTestId("b2b-header")).not.toBeInTheDocument();
  });
});

describe("PerformanceAppLayout title condensing", () => {
  test("condenses by scrollTop and stays condensed while the container grows", () => {
    render(<PerformanceAppLayout />);
    expect(titleBand()).not.toHaveAttribute("data-condensed", "true");

    scrollTo(100);
    expect(titleBand()).toHaveAttribute("data-condensed", "true");

    scrollTo(30);
    expect(titleBand()).toHaveAttribute("data-condensed", "true");

    scrollTo(0);
    expect(titleBand()).not.toHaveAttribute("data-condensed", "true");
  });
});
