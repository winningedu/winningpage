// 수행평가 진입 계약. GET /api/performance/bootstrap 의 응답 스키마. 요청 입력은 없다(인증 토큰만 쓴다).
// 값이 없을 때는 DB 컬럼 원본대로 null 로 내려오고, 클라이언트가 기본값을 채우지 않는다.

import { z } from "zod";

const nullableText = z.string().nullable();

/** 재방문 요약 카드(§5.4)가 쓰는 세션 요약. lastSession 과 latestDraft 가 같은 모양이다. */
export const sessionSummarySchema = z.looseObject({
  sessionId: z.string(),
  status: z.string(),
  currentStep: z.number(),
  completedSteps: z.array(z.number()),
  lastCompletedStep: z.number(),
  /** 이어서 하기가 데려갈 단계(1 이상 5 이하). 클라이언트가 다시 계산하지 않는다. */
  resumeStep: z.number(),
  gradeLabel: nullableText,
  semester: nullableText,
  schoolType: nullableText,
  subjectGroup: nullableText,
  subject: nullableText,
  careerGoal: nullableText,
  previousTopic: nullableText,
  guideInputMode: nullableText,
  selectedTopicId: nullableText,
  selectedTopicTitle: nullableText,
  /** 이 세션이 이미 회차를 소비했는가. */
  charged: z.boolean(),
  hasDesignReport: z.boolean(),
  hasEvaluationReport: z.boolean(),
  hasFinalReport: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bootstrapResponse = z.looseObject({
  profile: z.looseObject({
    id: z.string(),
    name: nullableText,
    schoolType: nullableText,
    schoolName: nullableText,
  }),
  entitlement: z.looseObject({
    serviceKey: z.string(),
    hasAccess: z.boolean(),
    /** null 은 무제한이다(0 이 아니다). */
    quotaTotal: z.number().nullable(),
    quotaRemaining: z.number().nullable(),
    planEndsAt: nullableText,
    planLabel: nullableText,
  }),
  lastSession: sessionSummarySchema.nullable(),
  latestDraft: sessionSummarySchema.nullable(),
});
