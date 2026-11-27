// 목표관리 학생 현황 계약(/api/goal/admin/students, resend-report, reset-student). 요청 스키마와 응답 스키마.
// 행은 컬럼이 많은 테이블과 뷰라 화면이 읽는 필드만 적고 나머지는 looseObject 로 연다(파생 컬럼 rate_*, base_*, cum_* 등).

import { z } from "zod";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

export const GOAL_STUDENT_FILTERS = [
  "all",
  "awaiting_cuts",
  "noSubmitToday",
  "noRecord",
  "paused",
] as const;
export type GoalStudentFilter = (typeof GOAL_STUDENT_FILTERS)[number];

export const goalStudentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().optional(),
  filter: z.enum(GOAL_STUDENT_FILTERS).default("all"),
});

export const goalStudentParams = z.object({ id: z.string().uuid() });

/** 화면의 더보기 한 번이 30건씩 늘고, 상한은 남용 방지용이다. */
export const GOAL_RECORDS_DEFAULT_LIMIT = 30;
export const GOAL_RECORDS_MAX_LIMIT = 1000;

export const goalRecordsQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(GOAL_RECORDS_MAX_LIMIT)
    .default(GOAL_RECORDS_DEFAULT_LIMIT),
});

// kind, periodKey 는 서버의 validateResendPeriod 가 한글 사유와 함께 검증한다(형식과 2주 규칙이 한 곳에 있다).
export const resendReportBody = z.object({
  studentProfileId: z.string().min(1),
  kind: z.unknown(),
  periodKey: z.unknown(),
});

export const resetStudentBody = z.object({ profileId: z.string().uuid() });

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const numeric = z.union([z.number(), z.string()]).nullish();
const nullableText = z.string().nullish();

export const goalStudentRowSchema = z.looseObject({
  profile_id: z.string(),
  grade: nullableText,
  school_type: nullableText,
  status: nullableText,
  ideal_university: nullableText,
  ideal_department: nullableText,
  min_university: nullableText,
  min_department: nullableText,
  current_mogo: numeric,
  current_score: numeric,
  converted_grade: numeric,
  remain_naesin: numeric,
  remain_mogo: numeric,
  last_naesin_exam: nullableText,
  last_mogo_exam: nullableText,
  week_ideal: numeric,
  week_min: numeric,
  naesin_scores: z.looseObject({ priorNaesinGrade: numeric }).nullish(),
  mock_exam_scores: z.unknown().optional(),
  study_schedule: z
    .record(
      z.string(),
      z.looseObject({ ideal: numeric, min: numeric }).optional(),
    )
    .nullish(),
  onboarded_at: nullableText,
  actual_start_date: nullableText,
});

export const goalStateRowSchema = z.looseObject({
  profile_id: z.string(),
  status: nullableText,
  record_count: z.number().nullish(),
  last_record_date: nullableText,
  onboarded_at: nullableText,
  ideal_susi: z.number().nullish(),
  ideal_jungsi: z.number().nullish(),
  min_susi: z.number().nullish(),
  min_jungsi: z.number().nullish(),
});

export const goalProfileRowSchema = z.looseObject({
  id: z.string(),
  name: nullableText,
  phone: nullableText,
  email: nullableText,
});

export const goalListRowSchema = goalStateRowSchema.extend({
  student: goalStudentRowSchema.nullable(),
  profile: goalProfileRowSchema.nullable(),
});

export const goalProbabilityLogRowSchema = z.looseObject({
  // goal_probability_logs.id 는 identity 정수 PK 다.
  id: z.number(),
  created_at: nullableText,
  reason: nullableText,
  ideal_susi: z.number().nullish(),
  ideal_jungsi: z.number().nullish(),
  min_susi: z.number().nullish(),
  min_jungsi: z.number().nullish(),
  source_record_id: z.union([z.string(), z.number()]).nullish(),
});

export const goalDailyRecordRowSchema = z.looseObject({
  // goal_daily_records.id 도 identity 정수 PK 다.
  id: z.number(),
  record_index: z.number().nullish(),
  record_date: nullableText,
  submitted_on: nullableText,
  virtual_day_index: z.number().nullish(),
  study_hours: numeric,
  target_ideal_hours: numeric,
  target_min_hours: numeric,
  body_condition: nullableText,
  tasks: z.array(z.string()).nullish(),
  memo: nullableText,
  delta_ideal_susi: z.number().nullish(),
  delta_ideal_jungsi: z.number().nullish(),
  delta_min_susi: z.number().nullish(),
  delta_min_jungsi: z.number().nullish(),
});

export const goalUniversityCutRowSchema = z.looseObject({
  avg_cut: z.number().nullish(),
  source: nullableText,
  source_year: numeric,
  updated_at: nullableText,
});

export const goalStudentsResponse = z.object({
  items: z.array(goalListRowSchema),
  total: z.number(),
  searchTruncated: z.boolean(),
});

export const goalStudentDetailResponse = z.object({
  student: goalStudentRowSchema,
  state: goalStateRowSchema.nullable(),
  profile: goalProfileRowSchema.nullable(),
  logs: z.array(goalProbabilityLogRowSchema),
  cuts: z.record(z.string(), goalUniversityCutRowSchema.nullable()),
});

export const goalRecordsResponse = z.object({
  items: z.array(goalDailyRecordRowSchema),
  total: z.number(),
});

export const resendReportResponse = z.object({
  sent: z.number(),
  failed: z.number(),
  skipped: z.number(),
  recipients: z.array(
    z.object({
      parentProfileId: z.string(),
      phone: z.string(),
      status: z.enum(["sent", "failed", "skipped"]),
      reason: z.string().optional(),
    }),
  ),
});

export type GoalStudentRow = z.output<typeof goalStudentRowSchema>;
export type GoalStateRow = z.output<typeof goalStateRowSchema>;
export type GoalProfileRow = z.output<typeof goalProfileRowSchema>;
export type GoalListRow = z.output<typeof goalListRowSchema>;
export type GoalProbabilityLogRow = z.output<
  typeof goalProbabilityLogRowSchema
>;
export type GoalDailyRecordRow = z.output<typeof goalDailyRecordRowSchema>;
export type GoalUniversityCutRow = z.output<typeof goalUniversityCutRowSchema>;
export type ResendReportResult = z.output<typeof resendReportResponse>;
export type GoalListParams = {
  page: number;
  q: string;
  filter: GoalStudentFilter;
};
