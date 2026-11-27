// 심화탐구 운영 도구 API 계약(관리자 이용권 부여, 종결 세션 복구). 서버(api/_routes/admin/inquiry-grant.ts, inquiry-recover.ts)가 요청 스키마로 검증하고,
// 브라우저(심화탐구 세션 화면)가 응답 스키마로 검증한다. 값 규칙과 한국어 사유(INVALID_BODY)는 서버의 api/_lib/inquiry/ops 가 맡는다.

import { z } from "zod";
import { quotaSnapshotSchema } from "../program-quota/contract.js";

/** 도메인 오류 코드(problem 의 code). */
export const INQUIRY_OPS_ERROR = {
  /** 모양은 맞지만 값 규칙을 어긴 본문. */
  INVALID_BODY: "INVALID_BODY",
  NOT_STUDENT: "NOT_STUDENT",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  NOT_RECOVERABLE: "NOT_RECOVERABLE",
  ALREADY_RECOVERED: "ALREADY_RECOVERED",
  OPEN_SESSION_EXISTS: "OPEN_SESSION_EXISTS",
} as const;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** POST inquiry-grant 본문. sessionQuota 가 null 이면 무제한이다. 정의되지 않은 키는 400 이다(insert 에는 서버가 정한 컬럼만 간다). */
export const inquiryGrantBody = z
  .object({
    profileId: z.string(),
    sessionQuota: z.number().nullable(),
    startsAt: z.string().nullish(),
    endsAt: z.string().nullish(),
  })
  .strict();

/** 브라우저가 보내는 모양. */
export type InquiryGrantInput = z.input<typeof inquiryGrantBody>;

/** POST inquiry-recover 본문. */
export const inquiryRecoverBody = z.object({ sessionId: z.string() }).strict();

export type InquiryRecoverInput = z.input<typeof inquiryRecoverBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 200 응답. */
export const inquiryGrantResultSchema = z.object({
  grantId: z.string(),
  quota: quotaSnapshotSchema,
});

export type InquiryGrantResult = z.output<typeof inquiryGrantResultSchema>;

/** 200 응답. */
export const inquiryRecoverResultSchema = z.object({
  newSessionId: z.string(),
});

export type InquiryRecoverResult = z.output<typeof inquiryRecoverResultSchema>;
