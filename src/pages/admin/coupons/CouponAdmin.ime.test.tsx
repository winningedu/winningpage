// 쿠폰 관리의 사용자 검색. 한글 조합 중 Enter는 조회를 부르지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const profileCalls: string[] = [];

const couponRow = {
  id: "c1",
  slug: "gift-1",
  title: "선물 쿠폰",
  kind: "fixed",
  discount_amount: 1000,
  min_amount: null,
  valid_until: null,
  max_uses_per_user: null,
  max_redemptions: null,
  stackable: false,
  grant_type: "granted",
  grant_on_signup: false,
  is_active: true,
  tenant_id: null,
  code: null,
};

function chain(table: string) {
  const result =
    table === "coupons"
      ? { data: [couponRow], error: null }
      : { data: [], error: null };
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        if (prop === "or" && table === "profiles") {
          return (filter: string) => {
            profileCalls.push(filter);
            return proxy;
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

import CouponAdmin from "./CouponAdmin";

beforeEach(() => {
  profileCalls.length = 0;
});

async function openGrantsView() {
  render(<CouponAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "발급 이력" }));
  return screen.findByPlaceholderText("이메일로 검색");
}

test("조합 중 Enter는 사용자 조회를 부르지 않고 조합이 끝난 Enter는 부른다", async () => {
  const input = await openGrantsView();
  fireEvent.change(input, { target: { value: "홍길" } });

  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(profileCalls).toEqual([]);

  fireEvent.keyDown(input, { key: "Enter" });
  expect(profileCalls).toHaveLength(1);
});
