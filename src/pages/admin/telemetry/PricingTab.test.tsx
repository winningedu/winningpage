import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ putPricing: vi.fn() }));

import PricingTab from "./PricingTab";

describe("PricingTab", () => {
  test("추가한 행의 입력칸도 접근 가능한 이름을 가진다", () => {
    render(<PricingTab initial={{ pricing: {}, updatedAt: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));
    const boxes = screen.getAllByRole("textbox");
    expect(boxes.length).toBe(8);
    for (const box of boxes) {
      expect(
        box.getAttribute("aria-label") || box.closest("label")?.textContent,
      ).toBeTruthy();
    }
    expect(screen.getAllByLabelText("모델명").length).toBe(2);
    expect(screen.getAllByLabelText("캐시 입력").length).toBe(2);
  });

  test("행마다 삭제 버튼은 행 번호가 든 이름을 가진다", () => {
    render(<PricingTab initial={{ pricing: {}, updatedAt: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));

    expect(screen.getByRole("button", { name: "삭제 1번째 행" })).toBeVisible();
    expect(screen.getByRole("button", { name: "삭제 2번째 행" })).toBeVisible();
  });
});
