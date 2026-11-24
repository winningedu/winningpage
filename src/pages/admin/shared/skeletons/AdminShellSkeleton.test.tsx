// 관리자 셸(사이드바, 상단바, 본문 표) 자리의 스켈레톤.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminShellSkeleton } from "./AdminShellSkeleton";

const BAR = '[data-slot="skeleton"]';

describe("AdminShellSkeleton", () => {
  test("셸 전체에 status는 하나뿐이고 이름은 관리자 페이지 불러오는 중이다", () => {
    render(<AdminShellSkeleton />);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByRole("status", { name: "관리자 페이지 불러오는 중" }),
    ).toBeTruthy();
    expect(screen.getByText("관리자 페이지 불러오는 중")).toBeTruthy();
  });

  test("사이드바는 실제 셸과 같은 w-56 고정 폭이고 상단바와 본문이 비켜 앉는다", () => {
    const { container } = render(<AdminShellSkeleton />);
    expect(
      container.querySelector('[data-part="sidebar"]')?.className,
    ).toContain("w-56");
    expect(
      container.querySelector('[data-part="topbar"]')?.className,
    ).toContain("left-56");
    expect(container.querySelector('[data-part="main"]')?.className).toContain(
      "ml-56",
    );
  });

  test("본문에 표 스켈레톤이 있고 모든 막대는 aria-hidden에 모션 줄이기를 따른다", () => {
    const { container } = render(<AdminShellSkeleton />);
    expect(container.querySelectorAll('[data-part="row"]')).toHaveLength(10);
    const bars = [...container.querySelectorAll(BAR)];
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.className).toContain("motion-reduce:animate-none");
    }
  });
});
