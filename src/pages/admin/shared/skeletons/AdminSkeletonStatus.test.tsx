// 관리자 스켈레톤 공통 래퍼. 스크린리더에는 상태 이름만 읽히고 막대는 숨겨진다.

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AdminSkeletonStatus } from "./AdminSkeletonStatus";
import { SkeletonBar } from "./SkeletonBar";

describe("AdminSkeletonStatus", () => {
  test("기본 이름으로 status 영역을 그린다", () => {
    render(<AdminSkeletonStatus />);
    const status = screen.getByRole("status", {
      name: "데이터를 불러오는 중입니다.",
    });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("데이터를 불러오는 중입니다.")).toBeTruthy();
  });

  test("label로 이름을 바꾸고 className을 받는다", () => {
    render(<AdminSkeletonStatus label="목록 불러오는 중" className="p-4" />);
    const status = screen.getByRole("status", { name: "목록 불러오는 중" });
    expect(status.className).toContain("p-4");
  });

  test("막대는 aria-hidden이고 모션 줄이기를 따른다", () => {
    const { container } = render(
      <AdminSkeletonStatus>
        <SkeletonBar className="h-4" />
      </AdminSkeletonStatus>,
    );
    const bar = container.querySelector('[data-slot="skeleton"]');
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    expect(bar?.className).toContain("motion-reduce:animate-none");
  });
});
