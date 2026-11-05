import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteHeader from "./SiteHeader";

const siteState = vi.hoisted(() => ({ b2bMenu: false }));
vi.mock("@/config/site", () => ({
  get site() {
    return { features: { b2bMenu: siteState.b2bMenu } };
  },
}));

// 헤더는 각자 테스트가 있다. 여기서는 사이트별 선택만 본다.
vi.mock("./Header", () => ({ default: () => <header>winning-header</header> }));
vi.mock("./b2b/Header", () => ({ default: () => <header>b2b-header</header> }));

afterEach(() => {
  siteState.b2bMenu = false;
});

describe("SiteHeader", () => {
  it("b2bMenu 사이트는 B2B 헤더를 그린다", () => {
    siteState.b2bMenu = true;
    render(<SiteHeader />);

    expect(screen.getByText("b2b-header")).toBeInTheDocument();
    expect(screen.queryByText("winning-header")).not.toBeInTheDocument();
  });

  it("위닝은 기존 헤더를 그대로 그린다", () => {
    render(<SiteHeader />);

    expect(screen.getByText("winning-header")).toBeInTheDocument();
    expect(screen.queryByText("b2b-header")).not.toBeInTheDocument();
  });
});
