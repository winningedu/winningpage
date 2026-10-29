import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PerformanceAppLayout from "./PerformanceAppLayout";

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
vi.mock("@/components/Header", () => ({ default: () => null }));
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
