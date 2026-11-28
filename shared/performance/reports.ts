// 수행평가 저장 리포트 계약. GET /api/performance/reports 의 쿼리와 응답(목록, 상세) 스키마.
// 쿼리에 sessionId 가 있으면 그 세션의 상세, 없으면 목록이다. 안쪽 섹션(모델 산출물)은 화면이 좁혀 읽는다.

import { z } from "zod";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/**
 * sessionId 는 DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
 * cursor 는 이전 페이지 마지막 항목의 updatedAt(시각 문자열)이다.
 * limit 는 숫자가 아니면 서버가 기본값으로 쓰고 범위는 서버가 자른다.
 */
export const reportsQuery = z.object({
  sessionId: z.guid().optional(),
  cursor: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || !Number.isNaN(new Date(value).getTime()),
      {
        message: "cursor가 올바르지 않습니다.",
      },
    )
    .optional(),
  limit: z.string().optional(),
});

/** 브라우저가 보내는 모양. */
export type ReportsQueryInput = z.input<typeof reportsQuery>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const nullableText = z.string().nullable();

export const reportListItemSchema = z.looseObject({
  sessionId: z.string(),
  topicTitle: nullableText,
  gradeLabel: nullableText,
  subjectGroup: nullableText,
  subject: nullableText,
  careerGoal: nullableText,
  updatedAt: z.string(),
  hasDesign: z.boolean(),
  hasEvaluation: z.boolean(),
  hasFinal: z.boolean(),
  designReportId: nullableText,
  evaluationReportId: nullableText,
  finalReportId: nullableText,
});

export const reportsListResponse = z.looseObject({
  items: z.array(reportListItemSchema),
  nextCursor: nullableText,
});

// 세 리포트가 공유하는 봉투 필드. 섹션 안쪽은 모델 산출물이라 좁히지 않는다.
const envelopeShape = {
  reportId: z.string(),
  sections: z.array(z.unknown()),
  model: nullableText,
  promptVersion: nullableText,
  createdAt: nullableText,
  updatedAt: nullableText,
};

const designReportSchema = z.looseObject({
  ...envelopeShape,
  topicId: nullableText,
  structure: z.unknown(),
  resources: z.array(z.unknown()),
});

// submissionId, revision, score, summary 는 컬럼이 비면 저장된 봉투 값으로 채우므로 타입을 좁히지 않는다.
const evaluationReportSchema = z.looseObject({
  ...envelopeShape,
  submissionId: z.unknown(),
  revision: z.unknown(),
  score: z.unknown(),
  summary: z.unknown(),
  structure: z.unknown(),
});

const finalReportSchema = z.looseObject({
  ...envelopeShape,
  submissionId: nullableText,
});

const submissionSchema = z.looseObject({
  submissionId: z.string(),
  revision: z.number(),
  fields: z.unknown(),
  charCounts: z.unknown(),
  isDraft: z.boolean(),
  isFinal: z.boolean(),
  finalizedAt: nullableText,
  finalizeReason: nullableText,
  submittedAt: nullableText,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reportDetailResponse = z.looseObject({
  session: z.looseObject({
    sessionId: z.string(),
    status: z.string(),
    gradeLabel: nullableText,
    semester: nullableText,
    subjectGroup: nullableText,
    subject: nullableText,
    careerGoal: nullableText,
    topicId: nullableText,
    topicTitle: nullableText,
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  design: designReportSchema.nullable(),
  evaluation: evaluationReportSchema.nullable(),
  final: finalReportSchema.nullable(),
  submissions: z.array(submissionSchema),
});
