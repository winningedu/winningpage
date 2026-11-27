// 수행평가 세션 계약. /api/performance/session 의 요청(GET 쿼리, POST 본문)과 응답 스키마.
// 형식 검사(누락, 타입, uuid, action)는 여기서 하고, 이전 주제의 줄 수와 길이 한도, 이용권, 미차감 세션 규칙은 라우트가 판정한다.

import { z } from "zod";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** GET: 세션 하나의 재개 재료. 값은 DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다). */
export const sessionQuery = z.object({ sessionId: z.guid() });

const requiredText = z.string().trim().min(1);

/** STEP1 기본 정보. 모르는 키(schoolType 등)는 버린다. school_type 은 서버가 프로필에서 읽는다. */
export const basicInfoSchema = z.object({
  gradeLabel: requiredText,
  semester: requiredText,
  subjectGroup: requiredText,
  subject: requiredText,
  careerGoal: requiredText,
  previousTopic: z.string().trim().optional(),
});

export const sessionBody = z.object({
  action: z.enum(["create", "resume"]),
  basicInfo: basicInfoSchema.nullish(),
});

/** 브라우저가 보내는 모양. */
export type SessionBodyInput = z.input<typeof sessionBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const nullableText = z.string().nullable();

export const sessionSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  currentStep: z.number(),
  completedSteps: z.array(z.number()),
  gradeLabel: nullableText,
  semester: nullableText,
  schoolType: nullableText,
  subjectGroup: nullableText,
  subject: nullableText,
  careerGoal: nullableText,
  previousTopic: nullableText,
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 추천 주제 한 건. 태그와 상세는 모델 산출물이라 안쪽은 화면이 좁혀 읽는다. */
export const topicSchema = z.looseObject({
  id: z.string(),
  round: z.number(),
  idx: z.number(),
  title: z.string(),
  subtitle: nullableText,
  tags: z.array(z.unknown()),
  detail: z.array(z.unknown()),
  selected: z.boolean(),
});

export const sessionDetailResponse = z.looseObject({
  session: sessionSchema.extend({
    guideInputMode: nullableText,
    selectedTopicId: nullableText,
    selectedTopicTitle: nullableText,
  }),
  topics: z.array(topicSchema),
  round: z.number(),
  maxRounds: z.number(),
});

export const sessionWriteResponse = z.looseObject({
  session: sessionSchema,
  quotaRemaining: z.number().nullable(),
});
