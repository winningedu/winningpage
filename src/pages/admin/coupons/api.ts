// 쿠폰 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import { toastError } from "@/pages/admin/shared/adminToast";
import { ADMIN_LOAD_ERROR_TEXT, ADMIN_UNKNOWN_ERROR_TEXT, TITLE } from "./copy";

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다.
export const couponSchema = z.looseObject({
  id: z.string(),
  slug: z.string(),
  code: z.string().nullable(),
  title: z.string(),
  discount_amount: z.number(),
  min_amount: z.number(),
  valid_until: z.string().nullable(),
  max_uses_per_user: z.number().nullable(),
  max_redemptions: z.number().nullable(),
  stackable: z.boolean(),
  grant_type: z.string(),
  grant_on_signup: z.boolean(),
  is_active: z.boolean(),
  // 단체 쿠폰 축. NULL 이면 소속 제한 없음.
  tenant_id: z.string().nullable(),
  created_at: z.string().optional(),
});
export type CouponRow = z.infer<typeof couponSchema>;

const couponListSchema = z.object({
  items: z.array(couponSchema),
  // 아래 셋은 부가 조회라 서버에서 실패하면 null 이다. 화면은 그 부분만 비운다.
  redemptionStats: z
    .object({
      byCoupon: z.record(
        z.string(),
        z.object({ active: z.number(), total: z.number() }),
      ),
      truncated: z.boolean(),
    })
    .nullable(),
  grantedCouponIds: z.array(z.string()).nullable(),
  tenants: z.array(z.object({ id: z.string(), name: z.string() })).nullable(),
});

export const couponKeys = {
  all: ["admin", "coupons"] as const,
  list: () => [...couponKeys.all, "list"] as const,
};

export function useCouponList() {
  return useQuery({
    queryKey: couponKeys.list(),
    queryFn: ({ signal }) =>
      api.get("admin/coupons", { signal }).json(couponListSchema),
  });
}

/** 서버 problem code 를 화면 문구로 바꾼다. 매핑에 없으면 공통 문구다. */
export function mappedErrorText(
  error: unknown,
  texts: Record<string, string>,
): string {
  if (error instanceof ApiError) {
    const text = texts[error.code];
    if (text) return text;
  }
  return ADMIN_UNKNOWN_ERROR_TEXT;
}

/** 조회 실패를 콘솔과 토스트로 알린다. 원문은 화면에 올리지 않는다. */
export function useLoadErrorToast(error: unknown) {
  useEffect(() => {
    if (!error) return;
    console.error(error);
    toastError(`${TITLE} 조회 실패`, ADMIN_LOAD_ERROR_TEXT);
  }, [error]);
}
