// 쿠폰 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  detail: (id: string) => [...couponKeys.all, "detail", id] as const,
  redemptions: (couponId: string) =>
    [...couponKeys.all, "redemptions", couponId] as const,
  grants: (couponId: string) =>
    [...couponKeys.all, "grants", couponId] as const,
  userSearch: (q: string) => [...couponKeys.all, "user-search", q] as const,
};

// 사용자 이름은 서버가 profiles 에서 붙인다. 조회에 실패했거나 게스트 결제면 null 이다.
const userSummarySchema = z
  .object({ name: z.string().nullable(), email: z.string().nullable() })
  .nullable();

const redemptionSchema = z.looseObject({
  id: z.number(),
  coupon_id: z.string(),
  order_id: z.string().nullish(),
  user_id: z.string().nullable(),
  discount_amount: z.number(),
  created_at: z.string(),
  voided_at: z.string().nullable(),
  void_reason: z.string().nullish(),
  user: userSummarySchema,
});
export type RedemptionRow = z.infer<typeof redemptionSchema>;

const redemptionListSchema = z.object({ items: z.array(redemptionSchema) });

const grantSchema = z.looseObject({
  id: z.number(),
  coupon_id: z.string(),
  user_id: z.string(),
  granted_at: z.string(),
  granted_by: z.string(),
  // 발급분 자체의 사용 기한. NULL 이면 무기한.
  valid_until: z.string().nullable(),
  revoked_at: z.string().nullable(),
  revoke_reason: z.string().nullish(),
  user: userSummarySchema,
});
export type GrantRow = z.infer<typeof grantSchema>;

const grantListSchema = z.object({ items: z.array(grantSchema) });

const userSearchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    }),
  ),
});
export type FoundUser = z.infer<typeof userSearchSchema>["items"][number];

// 서버 CouponPayload 와 같은 모양. 검사는 화면(validateForm)과 서버 zod 가 각자 한다.
export interface CouponPayload {
  slug: string;
  code: string | null;
  tenant_id: string | null;
  title: string;
  discount_amount: number;
  min_amount: number;
  is_active: boolean;
  stackable: boolean;
  grant_type: string;
  grant_on_signup: boolean;
  valid_until: string | null;
  max_uses_per_user: number | null;
  max_redemptions: number | null;
}

export function useCouponList() {
  return useQuery({
    queryKey: couponKeys.list(),
    queryFn: ({ signal }) =>
      api.get("admin/coupons", { signal }).json(couponListSchema),
  });
}

/** 쿠폰 한 건. id 가 없으면 요청하지 않는다. 새로고침과 수정 폼이 늘 서버 값을 보도록 캐시하지 않는다. */
export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: couponKeys.detail(id ?? ""),
    enabled: id !== undefined,
    gcTime: 0,
    queryFn: ({ signal }) =>
      api
        .get(`admin/coupons/${encodeURIComponent(id ?? "")}`, { signal })
        .json(couponSchema),
  });
}

/** 쿠폰 하나의 사용 이력. 서버가 최근 200건까지 준다. */
export function useRedemptions(couponId: string) {
  return useQuery({
    queryKey: couponKeys.redemptions(couponId),
    queryFn: ({ signal }) =>
      api
        .get(`admin/coupons/${encodeURIComponent(couponId)}/redemptions`, {
          signal,
        })
        .json(redemptionListSchema),
  });
}

/** 사용 이력 무효화. 이력과 목록의 사용 건수를 다시 받는다. 사유가 비면 키를 뺀다. */
export function useVoidRedemption(couponId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      redemptionId,
      reason,
    }: {
      redemptionId: number;
      reason: string;
    }) =>
      api
        .post(`admin/coupons/redemptions/${redemptionId}/void`, {
          json: reason.trim() ? { reason: reason.trim() } : {},
        })
        .json(z.looseObject({})),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: couponKeys.redemptions(couponId),
        }),
        queryClient.invalidateQueries({ queryKey: couponKeys.list() }),
      ]),
  });
}

/** 쿠폰 하나의 발급 목록. 서버가 최근 200건까지 준다. */
export function useGrants(couponId: string) {
  return useQuery({
    queryKey: couponKeys.grants(couponId),
    queryFn: ({ signal }) =>
      api
        .get(`admin/coupons/${encodeURIComponent(couponId)}/grants`, { signal })
        .json(grantListSchema),
  });
}

/** 사용자 검색. q 가 null 이면 아직 검색하지 않은 상태라 요청하지 않는다. */
export function useUserSearch(q: string | null) {
  return useQuery({
    queryKey: couponKeys.userSearch(q ?? ""),
    enabled: q !== null,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      api
        .get("admin/coupons/user-search", {
          searchParams: { q: q ?? "" },
          signal,
        })
        .json(userSearchSchema),
  });
}

/** 개별 발급. 발급 목록만 다시 받는다. */
export function useGrantCoupon(couponId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .post(`admin/coupons/${encodeURIComponent(couponId)}/grants`, {
          json: { userId },
        })
        .json(z.looseObject({})),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: couponKeys.grants(couponId) }),
  });
}

/** 발급 회수. 사유가 비면 키를 뺀다. 발급 목록만 다시 받는다. */
export function useRevokeGrant(couponId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, reason }: { grantId: number; reason: string }) =>
      api
        .post(`admin/coupons/grants/${grantId}/revoke`, {
          json: reason.trim() ? { reason: reason.trim() } : {},
        })
        .json(z.looseObject({})),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: couponKeys.grants(couponId) }),
  });
}

/** 등록(id 없음)과 수정. 저장하면 목록을 다시 받는다. */
export function useSaveCoupon(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CouponPayload) =>
      id === undefined
        ? api.post("admin/coupons", { json: payload }).json(couponSchema)
        : api
            .patch(`admin/coupons/${encodeURIComponent(id)}`, {
              json: payload,
            })
            .json(couponSchema),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: couponKeys.list() }),
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
