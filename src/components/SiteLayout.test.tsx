import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteLayout from "./SiteLayout";

const siteState = vi.hoisted(() => ({ b2bMenu: false }));
vi.mock("@/config/site", () => ({
  get site() {
    return { features: { b2bMenu: siteState.b2bMenu } };
  },
}));

// 헤더와 푸터는 각자 테스트가 있다. 여기서는 사이트별 선택만 본다.
vi.mock("./Header", () => ({ default: () => <header>winning-header</header> }));
vi.mock("./SiteFooter", () => ({
  default: () => <footer>winning-footer</footer>,
}));
vi.mock("./b2b/Header", () => ({ default: () => <header>b2b-header</header> }));
vi.mock("./b2b/Footer", () => ({ default: () => <footer>b2b-footer</footer> }));

afterEach(() => {
  siteState.b2bMenu = false;
});

function renderLayout() {
  return render(
    <MemoryRouter>
      <SiteLayout />
    </MemoryRouter>,
  );
}

describe("SiteLayout", () => {
  it("b2bMenu 사이트는 B2B 헤더와 푸터를 쓴다", () => {
    siteState.b2bMenu = true;
    renderLayout();

    expect(screen.getByText("b2b-header")).toBeInTheDocument();
    expect(screen.getByText("b2b-footer")).toBeInTheDocument();
    expect(screen.queryByText("winning-header")).not.toBeInTheDocument();
    expect(screen.queryByText("winning-footer")).not.toBeInTheDocument();
  });

  it("위닝은 기존 헤더와 푸터를 그대로 쓴다", () => {
    renderLayout();

    expect(screen.getByText("winning-header")).toBeInTheDocument();
    expect(screen.getByText("winning-footer")).toBeInTheDocument();
    expect(screen.queryByText("b2b-header")).not.toBeInTheDocument();
  });
});
