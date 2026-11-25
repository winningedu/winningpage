// 값 하나 자리의 한 줄 스켈레톤.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminLineSkeleton } from "./AdminLineSkeleton";

describe("AdminLineSkeleton", () => {
  test("기본 이름의 status와 막대 하나를 그린다", () => {
    const { container } = render(<AdminLineSkeleton />);
    const status = screen.getByRole("status", {
      name: "데이터를 불러오는 중입니다.",
    });
    expect(status.getAttribute("aria-busy")).toBe("true");
    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(1);
    expect(bars[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(bars[0]?.className).toContain("motion-reduce:animate-none");
  });

  test("label을 이름으로 쓴다", () => {
    render(<AdminLineSkeleton label="합계 불러오는 중" />);
    expect(screen.getByText("합계 불러오는 중")).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "합계 불러오는 중" }),
    ).toBeTruthy();
  });

  test("className으로 막대 크기를 바꾼다", () => {
    const { container } = render(<AdminLineSkeleton className="w-48" />);
    expect(
      container.querySelector('[data-slot="skeleton"]')?.className,
    ).toContain("w-48");
  });
});
