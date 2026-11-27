// 쿠폰 화면의 서버 호출. 요청 타입과 응답 스키마는 서버와 같은 계약(shared/coupon/contract.ts)을 쓰고, 조회는 react-query 키로 묶는다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, api } from "@/lib/http/client";
import { toastError } from "@/pages/admin/shared/adminToast";
import {
  type CouponSaveInput,
  couponListSchema,
  couponMutationResultSchema,
  couponSchema,
  grantListSchema,
  type ReasonInput,
  redemptionListSchema,
  userSearchSchema,
} from "../../../../shared/coupon/contract.js";
import { ADMIN_LOAD_ERROR_TEXT, ADMIN_UNKNOWN_ERROR_TEXT, TITLE } from "./copy";

export type {
  CouponRow,
  FoundUser,
  GrantRow,
  RedemptionRow,
} from "../../../../shared/coupon/contract.js";

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
          json: (reason.trim()
            ? { reason: reason.trim() }
            : {}) satisfies ReasonInput,
        })
        .json(couponMutationResultSchema),
    // 내가 무효화했으니 이력과 목록의 사용 건수를 비우고 스켈레톤 뒤에 새로 받는다.
    onSuccess: () =>
      Promise.all([
        queryClient.resetQueries({
          queryKey: couponKeys.redemptions(couponId),
        }),
        queryClient.resetQueries({ queryKey: couponKeys.list() }),
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

/** 개별 발급. 발급 목록만 비우고 스켈레톤 뒤에 새로 받는다. */
export function useGrantCoupon(couponId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .post(`admin/coupons/${encodeURIComponent(couponId)}/grants`, {
          json: { userId },
        })
        .json(couponMutationResultSchema),
    onSuccess: () =>
      queryClient.resetQueries({ queryKey: couponKeys.grants(couponId) }),
  });
}

/** 발급 회수. 사유가 비면 키를 뺀다. 발급 목록만 비우고 스켈레톤 뒤에 새로 받는다. */
export function useRevokeGrant(couponId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ grantId, reason }: { grantId: number; reason: string }) =>
      api
        .post(`admin/coupons/grants/${grantId}/revoke`, {
          json: (reason.trim()
            ? { reason: reason.trim() }
            : {}) satisfies ReasonInput,
        })
        .json(couponMutationResultSchema),
    onSuccess: () =>
      queryClient.resetQueries({ queryKey: couponKeys.grants(couponId) }),
  });
}

/** 등록(id 없음)과 수정. 저장하면 목록을 다시 받는다. */
export function useSaveCoupon(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CouponSaveInput) =>
      id === undefined
        ? api.post("admin/coupons", { json: payload }).json(couponSchema)
        : api
            .patch(`admin/coupons/${encodeURIComponent(id)}`, {
              json: payload,
            })
            .json(couponSchema),
    // 내가 저장했으니 옛 목록을 비우고 스켈레톤 뒤에 새로 받는다.
    onSuccess: () => queryClient.resetQueries({ queryKey: couponKeys.list() }),
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
