// 성장설계 운영 도구 API 계약(관리자 이용권 부여, 종결 회차 복구). 서버(api/_routes/admin/growth-grant.ts, growth-recover.ts)가 요청 스키마로 검증하고,
// 브라우저(성장설계 회차 화면)가 응답 스키마로 검증한다. 값 규칙과 한국어 사유(INVALID_BODY)는 서버의 api/_lib/growth/ops 가 맡는다.

import { z } from "zod";
import { quotaSnapshotSchema } from "../program-quota/contract.js";

/** 도메인 오류 코드(problem 의 code). */
export const GROWTH_OPS_ERROR = {
  /** 모양은 맞지만 값 규칙을 어긴 본문. */
  INVALID_BODY: "INVALID_BODY",
  NOT_STUDENT: "NOT_STUDENT",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND",
  NOT_RECOVERABLE: "NOT_RECOVERABLE",
  ALREADY_RECOVERED: "ALREADY_RECOVERED",
  OPEN_REPORT_EXISTS: "OPEN_REPORT_EXISTS",
} as const;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** POST growth-grant 본문. 정의되지 않은 키는 400 이다(insert 에는 서버가 정한 컬럼만 간다). */
export const growthGrantBody = z
  .object({
    profileId: z.string(),
    sessionQuota: z.number(),
    months: z.number().nullish(),
    endsAt: z.string().nullish(),
  })
  .strict();

/** 브라우저가 보내는 모양. */
export type GrowthGrantInput = z.input<typeof growthGrantBody>;

/** POST growth-recover 본문. */
export const growthRecoverBody = z.object({ reportId: z.string() }).strict();

export type GrowthRecoverInput = z.input<typeof growthRecoverBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 200 응답. */
export const growthGrantResultSchema = z.object({
  grantId: z.string(),
  quota: quotaSnapshotSchema,
});

export type GrowthGrantResult = z.output<typeof growthGrantResultSchema>;

/** 200 응답. */
export const growthRecoverResultSchema = z.object({ newReportId: z.string() });

export type GrowthRecoverResult = z.output<typeof growthRecoverResultSchema>;
