import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import GoalAppLayout from "./GoalAppLayout";

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
vi.mock("react-router", () => ({ Outlet: () => null }));
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
  default: () => <header data-testid="b2b-header" />,
}));
vi.mock("@/components/ui/RouteLoadingOverlay", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./GoalSidebar", () => ({ default: () => null }));

afterEach(() => {
  siteState.b2bMenu = false;
});

describe("GoalAppLayout header", () => {
  test("b2bMenu 사이트는 B2B 헤더를 그린다", () => {
    siteState.b2bMenu = true;
    render(<GoalAppLayout />);
    expect(screen.getByTestId("b2b-header")).toBeInTheDocument();
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
  });

  test("위닝은 기존 헤더를 그대로 그린다", () => {
    render(<GoalAppLayout />);
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.queryByTestId("b2b-header")).not.toBeInTheDocument();
  });
});
