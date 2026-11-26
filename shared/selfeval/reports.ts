// 자기평가서 조회 계약. GET /api/selfeval/reports 의 쿼리와 진입(목록) 응답. 상세 응답은 session.ts 의 sessionDetailResponseSchema 다.

import { z } from "zod";
import {
  areaSchema,
  highGradeSchema,
  SESSION_ROUTES,
  semesterSchema,
  sessionStatusSchema,
  sessionStepSchema,
} from "./contract.js";
import { growthPlanItemRefSchema } from "./session.js";

/** sessionId 가 없으면 진입과 목록, 있으면 그 세션의 상세. 값은 DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다). */
export const reportsQuery = z.object({ sessionId: z.guid().optional() });

const quotaSnapshotSchema = z.looseObject({
  quotaTotal: z.number().nullable(),
  quotaUsed: z.number().nullable(),
  quotaRemaining: z.number().nullable(),
  planEndsAt: z.string().nullable(),
  planLabel: z.string().nullable(),
});

const openSessionSummarySchema = z.looseObject({
  id: z.string(),
  status: sessionStatusSchema,
  currentStep: sessionStepSchema,
  route: z.enum(SESSION_ROUTES),
  area: areaSchema.nullable(),
  subject: z.string().nullable(),
  activityName: z.string().nullable(),
  lastActivityAt: z.string(),
});

const growthBannerSchema = z.looseObject({
  theme: z.string().nullable(),
  stageLabel: z.string().nullable(),
  currentSubtheme: z.string().nullable(),
  weakAxisNames: z.array(z.string()),
  issuedAt: z.string(),
});

const entryGrowthSchema = z.looseObject({
  reportId: z.string(),
  issuedAt: z.string(),
  stale: z.boolean(),
  banner: growthBannerSchema,
  planItems: z.array(growthPlanItemRefSchema),
});

const entryProfileSchema = z.looseObject({
  gradeLabel: highGradeSchema.nullable(),
  semester: semesterSchema.nullable(),
  career: z.string().nullable(),
  department: z.string().nullable(),
  universities: z.array(z.string()),
});

export const sessionListItemSchema = z.looseObject({
  id: z.string(),
  status: sessionStatusSchema,
  currentStep: sessionStepSchema,
  academicYear: z.number().nullable(),
  semester: semesterSchema.nullable(),
  area: areaSchema.nullable(),
  subject: z.string().nullable(),
  activityName: z.string().nullable(),
  score: z.number().nullable(),
  completedAt: z.string().nullable(),
  lastActivityAt: z.string(),
  expired: z.boolean(),
  discarded: z.boolean(),
  terminal: z.looseObject({ reason: z.string(), at: z.string() }).nullable(),
});

export const entryResponseSchema = z.looseObject({
  entry: z.looseObject({
    quota: quotaSnapshotSchema.nullable(),
    allowed: z.boolean(),
    /** 스쿨멘토에서만 있다. 기관 거부 사유(한도 소진 포함). */
    tenantReason: z.string().optional(),
    activityCount: z.number(),
    openSession: openSessionSummarySchema.nullable(),
    growth: entryGrowthSchema.nullable(),
    profile: entryProfileSchema.nullable(),
    replyResent: z.number(),
    academicYearDefault: z.number(),
    /** 회원 시간대(profiles.time_zone). 화면의 날짜 표기와 학년도 계산이 쓴다. */
    timeZone: z.string(),
  }),
  sessions: z.array(sessionListItemSchema),
});
