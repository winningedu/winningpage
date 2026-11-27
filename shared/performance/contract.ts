// 수행평가 영역(/api/performance/*) 계약. 서버(api/_routes/performance/*)와 화면(src/lib/performance/*)이 같은 스키마를 쓴다.
// 요청 본문은 JSON 객체면 받는다. 필드 검사와 400 문구(MISSING_FIELD 등)는 라우트가 예전 그대로 직접 한다.
// 응답은 looseObject 로 최상위 키만 고정한다. 안쪽 모양(리포트 섹션, 모델 산출물)은 화면 컴포넌트가 각자 좁혀 읽는다.

import { z } from "zod";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** JSON 객체 본문. Content-Type 이 JSON 이 아니면 빈 객체로 검사한다(예전 req.body 없음과 같다). */
export const jsonObjectBody = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// 실패
// ---------------------------------------------------------------------------

/**
 * 실패는 problem(RFC 9457)이다. code 는 예전 { error: { code } } 의 값을 그대로 쓰고,
 * 예전 최상위 형제 키(tenantReason, max, field, saved 등)는 같은 이름의 확장 멤버로 싣는다.
 * 라우트가 직접 낸 500 은 code INTERNAL, 처리되지 않은 예외의 500 은 INTERNAL_ERROR 다.
 */
export const PERFORMANCE_INTERNAL = "INTERNAL";

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const nullableNumber = z.number().nullable();
const nullableText = z.string().nullable();

/** 재방문 요약 카드의 세션 요약(bootstrap 의 lastSession, latestDraft). 화면이 읽는 필드만 고정한다. */
const sessionSummarySchema = z.looseObject({
  sessionId: z.string(),
  gradeLabel: nullableText,
  semester: nullableText,
  subjectGroup: nullableText,
  subject: nullableText,
  selectedTopicTitle: nullableText,
});

export const bootstrapResponse = z.looseObject({
  profile: z.looseObject({
    id: z.string(),
    name: z.string().nullable(),
    schoolType: z.string().nullable(),
    schoolName: z.string().nullable(),
  }),
  entitlement: z.looseObject({
    serviceKey: z.string(),
    hasAccess: z.boolean(),
    quotaTotal: nullableNumber,
    quotaRemaining: nullableNumber,
    planEndsAt: z.string().nullable(),
    planLabel: z.string().nullable(),
  }),
  lastSession: sessionSummarySchema.nullable(),
  latestDraft: sessionSummarySchema.nullable(),
});

export const analyzeGuideResponse = z.looseObject({
  guide: z.unknown(),
  attachments: z.array(z.unknown()),
  charged: z.boolean(),
});

export const recommendTopicsResponse = z.looseObject({
  round: z.number(),
  topics: z.array(z.unknown()),
  quotaRemaining: nullableNumber,
  charged: z.boolean(),
  maxRounds: z.number(),
});

export const designReportResponse = z.looseObject({
  charged: z.boolean(),
  generationCount: z.number(),
  maxGenerations: z.number(),
});

export const finalizeResponse = z.looseObject({
  submission: z.unknown(),
  finalReportId: z.string().nullable(),
  charged: z.boolean(),
});
