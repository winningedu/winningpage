// 수행평가 최종본 확정 계약. POST /api/performance/finalize 의 요청과 응답 스키마.
// 형식 검사(uuid, action)는 여기서 하고, 소유권과 평가 선행 조건은 도메인 규칙이라 라우트가 판정한다.

import { z } from "zod";

export const finalizeBody = z.object({
  // DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
  sessionId: z.guid(),
  submissionId: z.guid(),
  /** 생략하면 confirm 이다. new_assessment 는 다음 세션까지 준비한다. */
  action: z.enum(["confirm", "new_assessment"]).default("confirm"),
});

/** 브라우저가 보내는 모양. */
export type FinalizeBodyInput = z.input<typeof finalizeBody>;

export const finalizeResponse = z.looseObject({
  submission: z.looseObject({
    submissionId: z.string(),
    revision: z.number(),
    isFinal: z.literal(true),
    finalizedAt: z.string().nullable(),
    finalizeReason: z.string(),
  }),
  finalReportId: z.string().nullable(),
  /** 같은 제출본을 다시 확정한 경우(멱등)이면 true. */
  reused: z.boolean(),
  /** action 이 new_assessment 일 때만 온다. */
  nextSessionId: z.string().nullable().optional(),
  nextSessionCreated: z.boolean().optional(),
  charged: z.literal(false),
});
