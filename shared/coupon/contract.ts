// 쿠폰 관리 API 계약. 서버(api/_routes/admin/coupons.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/coupons/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { positiveIntId, uuidId } from "../http/params.js";

// 서버가 한 번에 읽는 행 수. 화면 문구("최근 200건")도 이 값을 따른다.
/** 목록 화면의 사용 통계와 발급 여부를 읽는 행 한도. 넘으면 redemptionStats.truncated 다. */
export const COUPON_SCAN_LIMIT = 10000;
/** 쿠폰 하나의 사용 이력, 발급 이력을 최근 순으로 읽는 행 수. */
export const COUPON_HISTORY_LIMIT = 200;
/** 발급 대상 사용자 검색 결과 수. */
export const COUPON_USER_SEARCH_LIMIT = 20;
export const COUPON_USER_SEARCH_MAX_LENGTH = 100;

export const COUPON_GRANT_TYPES = ["auto", "granted"] as const;

/** 쿠폰 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const COUPON_ERROR = {
  COUPON_DUPLICATE: "COUPON_DUPLICATE",
  COUPON_CAP_MISMATCH: "COUPON_CAP_MISMATCH",
  COUPON_CHECK_FAILED: "COUPON_CHECK_FAILED",
  COUPON_NOT_GRANTABLE: "COUPON_NOT_GRANTABLE",
  COUPON_ALREADY_REDEEMED: "COUPON_ALREADY_REDEEMED",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  GRANT_ALREADY_REVOKED: "GRANT_ALREADY_REVOKED",
  REDEMPTION_ALREADY_VOIDED: "REDEMPTION_ALREADY_VOIDED",
} as const;

export type CouponErrorCode = (typeof COUPON_ERROR)[keyof typeof COUPON_ERROR];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id 가 쿠폰 uuid 인 라우트. */
export const couponIdParams = z.object({ id: uuidId });
/** 경로 :id 가 발급, 사용 이력의 정수 id 인 라우트. */
export const rowIdParams = z.object({ id: positiveIntId });

const couponFields = {
  slug: z.string().trim().min(1),
  code: z.string().trim().min(1).nullable(),
  tenant_id: z.uuid().nullable(),
  title: z.string().trim().min(1),
  discount_amount: z.int(),
  min_amount: z.int(),
  is_active: z.boolean(),
  stackable: z.boolean(),
  grant_type: z.enum(COUPON_GRANT_TYPES),
  grant_on_signup: z.boolean(),
  // 컬럼이 date 라 날짜만 받는다.
  valid_until: z.iso.date().nullable(),
  max_uses_per_user: z.int().nullable(),
  max_redemptions: z.int().nullable(),
};

/**
 * 등록(POST)과 수정(PATCH) 본문. 범위 규칙은 두지 않는다: DB CHECK 가 업무 규칙이고 위반은 서버가 422 로 바꾼다.
 * coupons 의 나머지 컬럼(id, created_at, org_code)은 행 스냅샷을 그대로 보내도 조용히 버린다. 그 밖의 키는 strict 가 400 으로 막는다.
 */
export const couponSaveBody = z
  .strictObject({
    ...couponFields,
    id: z.unknown().optional(),
    created_at: z.unknown().optional(),
    org_code: z.unknown().optional(),
  })
  // 소속 쿠폰은 조건형(auto)에만 얹는다. 발급형은 coupon_grants 로 대상을 따로 정한다(화면 form.ts 와 같은 규칙).
  .refine((v) => !(v.tenant_id !== null && v.grant_type === "granted"), {
    path: ["tenant_id"],
    message: "소속 쿠폰은 조건형만 쓸 수 있어요.",
  })
  .transform(
    ({ id: _id, created_at: _createdAt, org_code: _orgCode, ...rest }) => rest,
  );

/** 브라우저가 보내는 모양. */
export type CouponSaveInput = z.input<typeof couponSaveBody>;
/** 서버가 저장하는 모양(13개 컬럼). */
export type CouponSaveValues = z.output<typeof couponSaveBody>;

export const grantBody = z.object({ userId: z.uuid() });
export type GrantInput = z.input<typeof grantBody>;

/** 발급 회수, 사용 이력 무효화 본문. 사유가 없으면 키를 뺀다. */
export const reasonBody = z.object({ reason: z.string().optional() });
export type ReasonInput = z.input<typeof reasonBody>;

export const userSearchQuery = z.object({
  q: z.string().min(1).max(COUPON_USER_SEARCH_MAX_LENGTH),
});

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

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

export const couponListSchema = z.object({
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
export const userSummarySchema = z
  .object({ name: z.string().nullable(), email: z.string().nullable() })
  .nullable();

export const redemptionSchema = z.looseObject({
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

export const redemptionListSchema = z.object({
  items: z.array(redemptionSchema),
});

export const grantSchema = z.looseObject({
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

export const grantListSchema = z.object({ items: z.array(grantSchema) });

export const userSearchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    }),
  ),
});
export type FoundUser = z.infer<typeof userSearchSchema>["items"][number];

/** 발급, 회수, 무효화 rpc 결과. 화면은 성공 여부만 쓰므로 모양을 묶지 않는다. */
export const couponMutationResultSchema = z.looseObject({});
