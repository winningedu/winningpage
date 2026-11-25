// 상세, 폼 자리의 스켈레톤. 행마다 라벨 막대와 값 막대 하나씩.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminDetailSkeleton } from "./AdminDetailSkeleton";

const BAR = '[data-slot="skeleton"]';

describe("AdminDetailSkeleton", () => {
  test("기본 이름과 label 이름의 status를 그린다", () => {
    const { rerender } = render(<AdminDetailSkeleton rows={3} />);
    expect(
      screen
        .getByRole("status", { name: "데이터를 불러오는 중입니다." })
        .getAttribute("aria-busy"),
    ).toBe("true");
    rerender(<AdminDetailSkeleton rows={3} label="상세 불러오는 중" />);
    expect(
      screen.getByRole("status", { name: "상세 불러오는 중" }),
    ).toBeTruthy();
  });

  test("rows행마다 라벨 막대와 값 막대가 하나씩이다", () => {
    const { container } = render(<AdminDetailSkeleton rows={5} />);
    expect(container.querySelectorAll('[data-part="row"]')).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-part="label"] ' + BAR),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-part="value"] ' + BAR),
    ).toHaveLength(5);
  });

  test("모든 막대는 aria-hidden이고 모션 줄이기를 따른다", () => {
    const { container } = render(<AdminDetailSkeleton rows={2} />);
    const bars = [...container.querySelectorAll(BAR)];
    expect(bars).toHaveLength(4);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.className).toContain("motion-reduce:animate-none");
    }
  });
});
