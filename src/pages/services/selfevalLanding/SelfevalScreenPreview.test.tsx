import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelfevalScreenPreview from "./SelfevalScreenPreview";

const siteState = vi.hoisted(() => ({
  homeUrl: "https://www.winningedu.com",
}));

vi.mock("@/config/site", () => ({
  site: {
    get homeUrl() {
      return siteState.homeUrl;
    },
  },
}));

const SLIDES = [
  { src: "/a.png", alt: "첫 화면" },
  { src: "/b.png", alt: "둘째 화면" },
];

describe("SelfevalScreenPreview 넘김 점", () => {
  it("활성 점은 primary 로 길고 비활성 점은 더 짙은 ink 로 키운 원이다", () => {
    render(<SelfevalScreenPreview slides={SLIDES} />);
    const active = screen.getByRole("button", { name: "1번째 화면" });
    const inactive = screen.getByRole("button", { name: "2번째 화면" });

    expect(active.className).toContain("bg-primary");
    expect(active.className).toContain("w-8");
    expect(active.className).toContain("h-3.5");
    expect(inactive.className).toContain("bg-ink-sub");
    expect(inactive.className).not.toContain("bg-ink-natural");
    expect(inactive.className).toContain("h-3.5");
    expect(inactive.className).toContain("w-3.5");
  });

  it("점을 누르면 활성 점이 바뀐다", () => {
    render(<SelfevalScreenPreview slides={SLIDES} />);
    fireEvent.click(screen.getByRole("button", { name: "2번째 화면" }));
    expect(
      screen.getByRole("button", { name: "2번째 화면" }).className,
    ).toContain("bg-primary");
    expect(
      screen.getByRole("button", { name: "1번째 화면" }).className,
    ).toContain("bg-ink-sub");
  });
});

describe("SelfevalScreenPreview 주소창", () => {
  beforeEach(() => {
    siteState.homeUrl = "https://www.winningedu.com";
  });

  it("위닝은 위닝에듀 주소를 보인다", () => {
    render(<SelfevalScreenPreview slides={SLIDES} />);
    expect(screen.getByText("https://www.winningedu.com")).toBeInTheDocument();
  });

  it("스쿨멘토는 스쿨멘토 주소를 보인다", () => {
    siteState.homeUrl = "https://www.schoolmentor.kr";
    render(<SelfevalScreenPreview slides={SLIDES} />);
    expect(screen.getByText("https://www.schoolmentor.kr")).toBeInTheDocument();
    expect(screen.queryByText(/winningedu\.com/)).toBeNull();
  });
});
