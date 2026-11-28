// 수행평가 평가 리포트 계약. POST /api/performance/evaluate 의 요청과 응답 스키마.
// 형식 검사(uuid, regenerate 타입)는 여기서 하고, 소유권, 회차, 제출물 글자 수 규칙은 도메인 규칙이라 라우트가 판정한다.
// 리포트 섹션 안쪽은 모델 산출물이라 화면이 좁혀 읽는다.

import { z } from "zod";

export const evaluateBody = z.object({
  // DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
  sessionId: z.guid(),
  submissionId: z.guid(),
  /** true 면 같은 제출본이라도 모델을 다시 부른다. */
  regenerate: z.boolean().optional(),
});

/** 브라우저가 보내는 모양. */
export type EvaluateBodyInput = z.input<typeof evaluateBody>;

export const evaluateResponse = z.looseObject({
  report: z.looseObject({
    id: z.string().nullable(),
    sections: z.array(z.unknown()),
    score: z.number().nullable(),
    summary: z.string(),
    structure: z.unknown(),
    model: z.string().nullable().optional(),
    promptVersion: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  }),
  submissionId: z.string(),
  submissionRevision: z.number(),
  /** 새로 만든 응답에만 온다(재생 응답에는 없다). */
  charCounts: z.record(z.string(), z.unknown()).optional(),
  quotaRemaining: z.number().nullable(),
  charged: z.literal(false),
  /** 저장된 리포트를 그대로 돌려준 재생 응답이면 true. */
  reused: z.boolean().optional(),
  evaluationCount: z.number(),
  maxEvaluations: z.number(),
});
