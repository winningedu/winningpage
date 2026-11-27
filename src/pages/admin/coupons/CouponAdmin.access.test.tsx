// 쿠폰 화면의 쓰기 권한. view 권한이면 등록, 수정, 저장, 발급, 회수, 무효화를 감추고 읽기 동작은 남긴다.

import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { on, resetApi } from "./fakeApi";
import { couponRow, listBody, renderCoupons } from "./testKit";

const redemption = {
  id: 7,
  coupon_id: "c1",
  order_id: "order-1",
  user_id: "u1",
  discount_amount: 1000,
  created_at: "2026-08-02T01:00:00Z",
  voided_at: null,
  void_reason: null,
  user: { name: "홍길동", email: "hong@example.com" },
};
const grant = {
  id: 5,
  coupon_id: "c1",
  user_id: "u1",
  granted_at: "2026-08-02T01:00:00Z",
  granted_by: "admin",
  valid_until: null,
  revoked_at: null,
  revoke_reason: null,
  user: { name: "홍길동", email: "hong@example.com" },
};

beforeEach(() => {
  resetApi();
  on("GET", "admin/coupons", listBody());
  on("GET", "admin/coupons/c1", couponRow);
  on("GET", "admin/coupons/c1/redemptions", { items: [redemption] });
  on("GET", "admin/coupons/c1/grants", { items: [grant] });
  on("GET", "admin/coupons/user-search", { items: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("목록은 view 권한에서 등록과 수정을 감추고 이력 버튼은 남긴다", async () => {
  renderCoupons("/admin/coupons", false);
  expect(
    await screen.findByRole("button", { name: "사용 이력" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "발급 이력" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "등록" })).toBeNull();
  expect(screen.queryByRole("button", { name: "수정" })).toBeNull();
});

test("목록은 edit 권한에서 등록과 수정을 보인다", async () => {
  renderCoupons("/admin/coupons", true);
  expect(await screen.findByRole("button", { name: "수정" })).toBeVisible();
  expect(screen.getByRole("button", { name: "등록" })).toBeVisible();
});

test("등록 주소로 바로 열어도 view 권한이면 저장과 코드 생성 버튼이 없다", async () => {
  renderCoupons("/admin/coupons/new", false);
  await screen.findByText("쿠폰 키");
  expect(screen.getByRole("button", { name: "취소" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "선물 쿠폰 코드 생성" }),
  ).toBeNull();
});

test("등록 폼은 edit 권한에서 저장과 코드 생성 버튼을 보인다", async () => {
  renderCoupons("/admin/coupons/new", true);
  await screen.findByText("쿠폰 키");
  expect(screen.getByRole("button", { name: "저장" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "선물 쿠폰 코드 생성" }),
  ).toBeVisible();
});

test("사용 이력은 view 권한에서 무효화 버튼을 감추고 이력은 보인다", async () => {
  renderCoupons("/admin/coupons/c1/history", false);
  expect(await screen.findByText("홍길동")).toBeVisible();
  expect(screen.queryByRole("button", { name: "무효화" })).toBeNull();
});

test("사용 이력은 edit 권한에서 무효화 버튼을 보인다", async () => {
  renderCoupons("/admin/coupons/c1/history", true);
  expect(await screen.findByRole("button", { name: "무효화" })).toBeVisible();
});

test("발급 관리는 view 권한에서 개별 발급과 회수를 감추고 발급 목록은 보인다", async () => {
  renderCoupons("/admin/coupons/c1/grants", false);
  expect(await screen.findByText("홍길동")).toBeVisible();
  expect(screen.queryByPlaceholderText("이메일로 검색")).toBeNull();
  expect(screen.queryByRole("button", { name: "회수" })).toBeNull();
});

test("발급 관리는 edit 권한에서 개별 발급과 회수를 보인다", async () => {
  renderCoupons("/admin/coupons/c1/grants", true);
  expect(await screen.findByRole("button", { name: "회수" })).toBeVisible();
  expect(screen.getByPlaceholderText("이메일로 검색")).toBeVisible();
});
