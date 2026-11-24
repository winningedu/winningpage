// 요약 카드 자리의 스켈레톤.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminCardsSkeleton } from "./AdminCardsSkeleton";

const BAR = '[data-slot="skeleton"]';

describe("AdminCardsSkeleton", () => {
  test("기본 이름과 label 이름의 status를 그린다", () => {
    const { rerender } = render(<AdminCardsSkeleton count={4} />);
    expect(
      screen
        .getByRole("status", { name: "데이터를 불러오는 중입니다." })
        .getAttribute("aria-busy"),
    ).toBe("true");
    rerender(<AdminCardsSkeleton count={4} label="요약 불러오는 중" />);
    expect(
      screen.getByRole("status", { name: "요약 불러오는 중" }),
    ).toBeTruthy();
  });

  test("count개의 카드를 2열, lg 4열 격자로 그린다", () => {
    const { container } = render(<AdminCardsSkeleton count={6} />);
    expect(container.querySelectorAll('[data-part="card"]')).toHaveLength(6);
    const grid = container.querySelector('[data-part="grid"]');
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).toContain("lg:grid-cols-4");
  });

  test("모든 막대는 aria-hidden이고 모션 줄이기를 따른다", () => {
    const { container } = render(<AdminCardsSkeleton count={2} />);
    const bars = [...container.querySelectorAll(BAR)];
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.className).toContain("motion-reduce:animate-none");
    }
  });
});
