import { describe, expect, it } from "vitest";
import { formatCouponDeadline } from "./couponDeadline";

describe("formatCouponDeadline", () => {
  it("날짜 문자열을 시간대 변환 없이 월 일로 표기한다", () => {
    expect(formatCouponDeadline("2026-11-30")).toBe("~11월 30일까지");
    expect(formatCouponDeadline("2026-12-01")).toBe("~12월 1일까지");
  });

  it("값이 없으면 null", () => {
    expect(formatCouponDeadline(null)).toBeNull();
    expect(formatCouponDeadline("")).toBeNull();
  });

  it("날짜 형식이 아니면 null", () => {
    expect(formatCouponDeadline("not-a-date")).toBeNull();
    expect(formatCouponDeadline("2026-13-01")).toBeNull();
    expect(formatCouponDeadline("2026-02-30")).toBeNull();
  });
});
