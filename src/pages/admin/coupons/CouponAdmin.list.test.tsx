// 쿠폰 목록 표. 헤더 범위, 고정 관리 칸, 아이콘 버튼 이름, 부가 조회 열화를 확인한다.

import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, on, resetApi } from "./fakeApi";
import { listBody, renderCoupons } from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", "admin/coupons", listBody());
});

test("목록 헤더는 열 범위를 갖고 관리 칸은 고정되며 행 hover 색이 맞는다", async () => {
  renderCoupons();
  const edit = await screen.findByRole("button", { name: "수정" });

  const headers = screen.getAllByRole("columnheader");
  for (const header of headers) expect(header).toHaveAttribute("scope", "col");

  const sticky = edit.closest("td");
  expect(sticky).toHaveClass("sticky", "right-0", "group-hover:bg-muted");
  expect(edit.closest("tr")).toHaveClass("group");
  expect(callsTo("GET", "admin/coupons")).toHaveLength(1);
});

test("사용 건수, 발급 이력 버튼 게이트, 열화(null)가 예전과 같다", async () => {
  on(
    "GET",
    "admin/coupons",
    listBody({
      items: [
        { ...(listBody().items[0] as object), id: "c1", grant_type: "auto" },
      ],
      redemptionStats: {
        byCoupon: { c1: { active: 2, total: 3 } },
        truncated: true,
      },
      grantedCouponIds: ["c1"],
    }),
  );
  const first = renderCoupons();
  expect(await screen.findByText("2 / 3+")).toBeVisible();
  expect(screen.getByRole("button", { name: "발급 이력" })).toBeVisible();
  first.unmount();

  on(
    "GET",
    "admin/coupons",
    listBody({
      items: [
        { ...(listBody().items[0] as object), id: "c1", grant_type: "auto" },
      ],
      redemptionStats: null,
      grantedCouponIds: null,
      tenants: null,
    }),
  );
  renderCoupons();
  expect(await screen.findByText("0 / 0")).toBeVisible();
  expect(screen.queryByRole("button", { name: "발급 이력" })).toBeNull();
});
