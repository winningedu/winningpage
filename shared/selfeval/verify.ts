// 자기평가서 검증 계약. POST /api/selfeval/verify 의 요청과 응답 스키마.
// 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.

import { z } from "zod";
import { sessionStepSchema } from "./contract.js";
import { stepIssueSchema } from "./session.js";

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
export const verifyBody = z.object({ sessionId: z.guid() });

/** 브라우저가 보내는 모양. */
export type VerifyBodyInput = z.input<typeof verifyBody>;

/** 검증 리포트. sections 의 점수 항목, 형식 검사 같은 세부 모양은 화면의 타입이 맡는다. */
const verificationSchema = z.looseObject({
  id: z.string(),
  revision: z.number(),
  sections: z.looseObject({ total: z.number() }),
  score: z.number(),
  mandatoryFixes: z.array(z.unknown()),
});

export const verifyResponse = z.looseObject({
  verification: verificationSchema,
  charged: z.boolean(),
  currentStep: sessionStepSchema,
  attempts: z.number(),
  softIssues: z.array(stepIssueSchema),
});
