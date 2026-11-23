// 쿠폰 등록 폼. 이름 없는 입력에 이름이 붙고, 무제한 3상태와 숫자 필터는 그대로 동작한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

function chain() {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: [], error: null });
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({ supabase: { from: () => chain() } }));

import CouponAdmin from "./CouponAdmin";

async function openCreate() {
  render(<CouponAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "등록" }));
  await screen.findByText("쿠폰 키");
}

test("이름 없던 체크박스와 입력에 한국어 이름이 있다", async () => {
  await openCreate();

  expect(screen.getByRole("checkbox", { name: "중복 사용" })).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "가입 시 자동 발급" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "쿠폰 이름" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "고객 입력 코드" })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "할인 금액" })).toBeVisible();
  expect(
    screen.getByRole("spinbutton", { name: "최소 결제 금액" }),
  ).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "소속(단체 쿠폰)" }),
  ).toBeVisible();
});

test("할인 금액 입력은 숫자만 남기고 문자열로 유지한다", async () => {
  await openCreate();
  const input = screen.getByRole("spinbutton", { name: "할인 금액" });

  fireEvent.change(input, { target: { value: "1200" } });
  expect(input).toHaveValue(1200);
  expect(screen.getByText("1,200원")).toBeVisible();
});

test("총 발행 수량은 무제한을 고르면 값을 비우고 입력을 잠근다", async () => {
  await openCreate();
  const unlimited = screen.getByRole("radio", { name: "총 발행 수량 무제한" });
  const valueMode = screen.getByRole("radio", { name: "총 발행 수량 값 지정" });
  const input = screen.getByRole("spinbutton", { name: "총 발행 수량" });

  fireEvent.click(valueMode);
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value: "30" } });
  expect(input).toHaveValue(30);

  fireEvent.click(unlimited);
  expect(input).toBeDisabled();
  expect(input).toHaveValue(null);

  fireEvent.click(valueMode);
  expect(input).toBeEnabled();
  expect(input).toHaveValue(null);
});
