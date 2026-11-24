// 목록 표 자리의 스켈레톤. 헤더 막대 columns개, 본문 막대 rows x columns개.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminTableSkeleton, TableSkeletonGrid } from "./AdminTableSkeleton";

const BAR = '[data-slot="skeleton"]';

describe("AdminTableSkeleton", () => {
  test("기본 이름의 status를 그린다", () => {
    render(<AdminTableSkeleton columns={4} />);
    const status = screen.getByRole("status", {
      name: "데이터를 불러오는 중입니다.",
    });
    expect(status.getAttribute("aria-busy")).toBe("true");
  });

  test("label로 이름을 바꾼다", () => {
    render(<AdminTableSkeleton columns={4} label="회원 불러오는 중" />);
    expect(
      screen.getByRole("status", { name: "회원 불러오는 중" }),
    ).toBeTruthy();
  });

  test("헤더 막대는 columns개, 본문은 기본 10행이다", () => {
    const { container } = render(<AdminTableSkeleton columns={4} />);
    expect(
      container.querySelectorAll('[data-part="header"] ' + BAR),
    ).toHaveLength(4);
    expect(container.querySelectorAll('[data-part="row"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-part="row"] ' + BAR)).toHaveLength(
      40,
    );
  });

  test("rows를 주면 그 행 수만큼 그린다", () => {
    const { container } = render(<AdminTableSkeleton columns={3} rows={2} />);
    expect(container.querySelectorAll('[data-part="row"] ' + BAR)).toHaveLength(
      6,
    );
  });

  test("모든 막대는 aria-hidden이고 모션 줄이기를 따른다", () => {
    const { container } = render(<AdminTableSkeleton columns={2} rows={1} />);
    const bars = [...container.querySelectorAll(BAR)];
    expect(bars.length).toBe(4);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.className).toContain("motion-reduce:animate-none");
    }
  });

  test("TableSkeletonGrid는 status 없이 막대만 그린다", () => {
    render(<TableSkeletonGrid columns={2} rows={1} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
