// 자기평가서 분석 계약. POST /api/selfeval/analyze 의 요청(run, save, resolve-conflict)과 응답 스키마.
// 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.

import { z } from "zod";
import { ANALYSIS_FIELDS, sessionStepSchema } from "./contract.js";
import { analysisSchema, stepIssueSchema } from "./session.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

// DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
const sessionId = z.guid();

export const analyzeBody = z.discriminatedUnion("action", [
  z.object({ sessionId, action: z.literal("run") }),
  z.object({
    sessionId,
    action: z.literal("save"),
    // 고친 항목만 담는다. 모르는 항목 이름은 거절한다.
    edits: z.partialRecord(z.enum(ANALYSIS_FIELDS), z.string()),
  }),
  z.object({
    sessionId,
    action: z.literal("resolve-conflict"),
    index: z.int().min(0),
    choice: z.enum(["a", "b"]),
  }),
]);

/** 브라우저가 보내는 모양. */
export type AnalyzeBodyInput = z.input<typeof analyzeBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** run 의 응답. 모델 단계라 attempts 와 softIssues 가 함께 온다. */
export const analyzeRunResponse = z.looseObject({
  analysis: analysisSchema,
  conflicts: analysisSchema.shape.conflicts,
  analysisSource: z.enum(["model", "student"]),
  currentStep: sessionStepSchema,
  attempts: z.number(),
  softIssues: z.array(stepIssueSchema),
});

/** save, resolve-conflict 의 응답. */
export const analyzeEditResponse = z.looseObject({
  analysis: analysisSchema,
});
