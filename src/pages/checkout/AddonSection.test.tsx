import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AddonProduct } from "@/lib/products";
import AddonSection from "./AddonSection";

function addon(serviceKey: string, serviceName: string): AddonProduct {
  return {
    id: `${serviceKey}-extra`,
    name: `[추가 1회] ${serviceName}`,
    listPrice: 2000,
    price: 2000,
    badge: null,
    recommended: false,
    isOrderable: true,
    tenantId: null,
    saleEndsAt: null,
    serviceKey,
    serviceName,
  };
}

const addons = [
  addon("suhaeng", "위닝 수행평가"),
  addon("inquiry", "위닝 심화탐구"),
];

describe("AddonSection", () => {
  it("제목에 상품 단가를 넣고 서비스별 행을 그린다", () => {
    render(<AddonSection addons={addons} quantities={{}} onChange={vi.fn()} />);
    expect(
      screen.getByRole("heading", {
        name: "서비스 이용고객 중 이용권 추가 (1회당 할인가 2,000원)",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("남은 횟수가 있어도 미리 추가할 수 있어요."),
    ).toBeTruthy();
    expect(screen.getByText("[추가 1회] 위닝 수행평가")).toBeTruthy();
    expect(screen.getByText("[추가 1회] 위닝 심화탐구")).toBeTruthy();
  });

  it("플러스와 마이너스가 다음 수량으로 onChange 를 부른다", () => {
    const onChange = vi.fn();
    render(
      <AddonSection
        addons={addons}
        quantities={{ "suhaeng-extra": 2 }}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "위닝 수행평가 추가 수량 늘리기" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("suhaeng-extra", 3);
    fireEvent.click(
      screen.getByRole("button", { name: "위닝 수행평가 추가 수량 줄이기" }),
    );
    expect(onChange).toHaveBeenLastCalledWith("suhaeng-extra", 1);
  });

  it("10 에서 플러스, 0 에서 마이너스가 비활성이다", () => {
    render(
      <AddonSection
        addons={addons}
        quantities={{ "suhaeng-extra": 10 }}
        onChange={vi.fn()}
      />,
    );
    const plus = screen.getByRole("button", {
      name: "위닝 수행평가 추가 수량 늘리기",
    }) as HTMLButtonElement;
    const minus = screen.getByRole("button", {
      name: "위닝 심화탐구 추가 수량 줄이기",
    }) as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
    expect(minus.disabled).toBe(true);
  });

  it("수량이 있으면 단가 곱 수량을 보이고 0 이면 금액을 비운다", () => {
    render(
      <AddonSection
        addons={addons}
        quantities={{ "suhaeng-extra": 2 }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText("4,000원")).toHaveLength(1);
    expect(screen.queryByText("0원")).toBeNull();
  });
});
