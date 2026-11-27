// 쿠폰 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  COUPON_ERROR,
  COUPON_GRANT_TYPES,
  couponListSchema,
  couponSaveBody,
  grantBody,
  reasonBody,
  userSearchQuery,
} from "./contract.js";

const PAYLOAD = {
  slug: "welcome",
  code: null,
  tenant_id: null,
  title: "가입 환영",
  discount_amount: 1000,
  min_amount: 0,
  is_active: true,
  stackable: false,
  grant_type: "granted",
  grant_on_signup: false,
  valid_until: null,
  max_uses_per_user: 1,
  max_redemptions: null,
} as const;

describe("couponSaveBody", () => {
  test("문자열 앞뒤 공백을 걷는다", () => {
    expect(couponSaveBody.parse({ ...PAYLOAD, slug: "  a  " }).slug).toBe("a");
  });

  test("행 스냅샷의 id, created_at, org_code 는 버리고 13개 키만 남긴다", () => {
    const parsed = couponSaveBody.parse({
      ...PAYLOAD,
      id: "x",
      created_at: "2026-01-01T00:00:00Z",
      org_code: "o",
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(PAYLOAD).sort());
  });

  test("coupons 컬럼이 아닌 키는 거부한다", () => {
    expect(couponSaveBody.safeParse({ ...PAYLOAD, extra: 1 }).success).toBe(
      false,
    );
  });

  test("소속 쿠폰에 발급형은 tenant_id 경로로 거부한다", () => {
    const result = couponSaveBody.safeParse({
      ...PAYLOAD,
      tenant_id: "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["tenant_id"]);
  });

  test("grant_type 은 계약의 두 값만 받는다", () => {
    expect(COUPON_GRANT_TYPES).toEqual(["auto", "granted"]);
    expect(
      couponSaveBody.safeParse({ ...PAYLOAD, grant_type: "manual" }).success,
    ).toBe(false);
  });
});

describe("작은 요청 스키마", () => {
  test("발급은 uuid userId", () => {
    expect(grantBody.safeParse({ userId: "x" }).success).toBe(false);
  });

  test("사유는 선택이다", () => {
    expect(reasonBody.parse({})).toEqual({});
  });

  test("검색어는 1자에서 100자", () => {
    expect(userSearchQuery.safeParse({ q: "" }).success).toBe(false);
    expect(userSearchQuery.safeParse({ q: "a".repeat(101) }).success).toBe(
      false,
    );
    expect(userSearchQuery.parse({ q: "a".repeat(100) }).q).toHaveLength(100);
  });
});

describe("응답 스키마", () => {
  test("목록은 곁가지가 null 이어도 받는다", () => {
    expect(
      couponListSchema.parse({
        items: [],
        redemptionStats: null,
        grantedCouponIds: null,
        tenants: null,
      }),
    ).toEqual({
      items: [],
      redemptionStats: null,
      grantedCouponIds: null,
      tenants: null,
    });
  });
});

describe("COUPON_ERROR", () => {
  test("키와 값이 같다", () => {
    for (const [key, value] of Object.entries(COUPON_ERROR)) {
      expect(value).toBe(key);
    }
  });
});
