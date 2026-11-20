// 쿠폰 목록 표. 헤더 범위, 고정 관리 칸, 아이콘 버튼 이름을 확인한다.

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

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

test("목록 헤더는 열 범위를 갖고 관리 칸은 고정되며 행 hover 색이 맞는다", async () => {
  render(<CouponAdmin />);
  const edit = await screen.findByRole("button", { name: "수정" });

  const headers = screen.getAllByRole("columnheader");
  for (const header of headers) expect(header).toHaveAttribute("scope", "col");

  const sticky = edit.closest("td");
  expect(sticky).toHaveClass("sticky", "right-0", "group-hover:bg-muted");
  expect(edit.closest("tr")).toHaveClass("group");
});
