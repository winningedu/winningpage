// AdminPagination: 상태(state)로 페이지를 넘기는 관리자 화면용 페이지 이동.
// URL 이동이 아니므로 모든 컨트롤은 <button> 이어야 한다.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdminPagination from "./AdminPagination";

afterEach(cleanup);

describe("AdminPagination", () => {
  test("현재 페이지에만 aria-current=page 가 붙고 컨트롤마다 한국어 라벨이 있다", () => {
    render(<AdminPagination page={2} totalPages={3} onPageChange={() => {}} />);

    expect(
      screen
        .getByRole("button", { name: "2페이지" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("button", { name: "1페이지" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 페이지" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("첫 페이지에서는 이전과 처음 컨트롤이 비활성이고 다음이 페이지를 옮긴다", () => {
    const onPageChange = vi.fn();
    render(
      <AdminPagination page={1} totalPages={3} onPageChange={onPageChange} />,
    );

    expect(
      (screen.getByRole("button", { name: "이전 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "첫 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  test("마지막 페이지에서는 다음과 끝 컨트롤이 비활성이다", () => {
    render(<AdminPagination page={3} totalPages={3} onPageChange={() => {}} />);

    expect(
      (screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "마지막 페이지",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("번호 창은 현재 페이지를 가운데 두고 최대 10칸만 보여 준다", () => {
    render(
      <AdminPagination page={50} totalPages={4300} onPageChange={() => {}} />,
    );

    const numbered = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((label) => /^\d+페이지$/.test(label));
    expect(numbered).toHaveLength(10);
    expect(numbered).toContain("50페이지");
    expect(screen.getByText("50 / 4,300 페이지")).toBeTruthy();
  });

  test("네 자리 페이지 번호도 고정폭 없이 자기 너비로 렌더된다", () => {
    render(
      <AdminPagination page={4300} totalPages={4300} onPageChange={() => {}} />,
    );

    const button = screen.getByRole("button", { name: "4300페이지" });
    expect(button.textContent).toBe("4300");
    expect(button.className).toContain("w-auto");
    expect(button.className).toContain("min-w-8");
  });
});
