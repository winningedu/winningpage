// 자기평가서 운영 도구 API 계약(관리자 이용권 부여, 종결 세션 복구). 서버(api/_routes/admin/selfeval-grant.ts, selfeval-recover.ts)가 요청 스키마로 검증하고,
// 브라우저(자기평가서 세션 화면)가 응답 스키마로 검증한다. 값 규칙과 한국어 사유(INVALID_BODY)는 서버의 api/_lib/selfeval/ops 가 맡는다.

import { z } from "zod";
import { quotaSnapshotSchema } from "../program-quota/contract.js";

/** 도메인 오류 코드(problem 의 code). */
export const SELFEVAL_OPS_ERROR = {
  /** 모양은 맞지만 값 규칙을 어긴 본문. */
  INVALID_BODY: "INVALID_BODY",
  NOT_STUDENT: "NOT_STUDENT",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  NOT_RECOVERABLE: "NOT_RECOVERABLE",
  ALREADY_RECOVERED: "ALREADY_RECOVERED",
  SESSION_OPEN: "SESSION_OPEN",
} as const;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** POST selfeval-grant 본문. 모르는 키는 zod 가 버린다(insert 에는 서버가 정한 컬럼만 간다). */
export const selfevalGrantBody = z.object({
  profileId: z.string(),
  sessionQuota: z.number(),
  months: z.number().nullish(),
  endsAt: z.string().nullish(),
});

/** 브라우저가 보내는 모양. */
export type SelfevalGrantInput = z.input<typeof selfevalGrantBody>;

/** POST selfeval-recover 본문. */
export const selfevalRecoverBody = z.object({ sessionId: z.string() });

export type SelfevalRecoverInput = z.input<typeof selfevalRecoverBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 200 응답. */
export const selfevalGrantResultSchema = z.object({
  grantId: z.string(),
  quota: quotaSnapshotSchema,
});

export type SelfevalGrantResult = z.output<typeof selfevalGrantResultSchema>;

/** 200 응답. */
export const selfevalRecoverResultSchema = z.object({
  newSessionId: z.string(),
});

export type SelfevalRecoverResult = z.output<
  typeof selfevalRecoverResultSchema
>;
