// 서비스 이용횟수 조정 API 계약. 서버(api/_routes/admin/service-credit-summary.ts, service-credit-adjust.ts)는 요청 스키마로 검증하고,
// 브라우저(src/pages/admin/service-credit/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 서비스 이용횟수 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const SERVICE_CREDIT_ERROR = {
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  NOT_STUDENT: "NOT_STUDENT",
  INVALID_BODY: "INVALID_BODY",
  NO_ENTITLEMENT: "NO_ENTITLEMENT",
  UNLIMITED_SESSIONS: "UNLIMITED_SESSIONS",
  INSUFFICIENT_CREDIT: "INSUFFICIENT_CREDIT",
} as const;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** GET 쿼리. 현황을 볼 고객 한 명. */
export const summaryQuery = z.object({ profileId: z.uuid() });

/**
 * POST 본문. 여기서는 모양만 보고 모르는 키를 버린다.
 * 값 규칙(uuid, programKey, 0 이 아닌 정수 delta, months, reason 길이)은 서버의 validateAdjustBody 가 맡고 어기면 400 INVALID_BODY 다.
 */
export const adjustBody = z.object({
  profileId: z.string(),
  programKey: z.string(),
  delta: z.number(),
  months: z.number().nullish(),
  reason: z.string(),
});

/** 브라우저가 보내는 모양. */
export type AdjustInput = z.input<typeof adjustBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const serviceCreditRowSchema = z.object({
  programKey: z.string(),
  label: z.string(),
  periodBased: z.boolean(),
  liveCount: z.number(),
  // null 이면 회차 무제한 이용권(기간형). 이용권이 없으면 0.
  quotaTotal: z.number().nullable(),
  quotaUsed: z.number(),
  quotaRemaining: z.number().nullable(),
  expiresAt: z.string().nullable(),
});
export type ServiceCreditRow = z.infer<typeof serviceCreditRowSchema>;

export const serviceCreditSummarySchema = z.object({
  student: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  items: z.array(serviceCreditRowSchema),
});
export type ServiceCreditSummary = z.infer<typeof serviceCreditSummarySchema>;

export const adjustResultSchema = z.object({ credit: serviceCreditRowSchema });
export type AdjustResult = z.infer<typeof adjustResultSchema>;
