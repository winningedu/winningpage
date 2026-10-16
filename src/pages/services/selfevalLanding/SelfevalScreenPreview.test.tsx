import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SelfevalScreenPreview from "./SelfevalScreenPreview";

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
