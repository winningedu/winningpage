// 오늘의 공부 기록 계약. GET/POST /api/goal/daily-record 의 요청과 응답 스키마.
// 요청은 모양(코드 목록, 타입)만 막는다. 온보딩 상태, 12시간 쿨다운, 순공 시간 규칙은 서버가 도메인 규칙으로 막는다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

/** 학습 항목 코드. api/_routes/goal/daily-record.ts TASK_LABELS 의 키와 같다(daily-record.route.test.ts 가 맞는지 본다). */
export const TASK_CODES = [
  "concept",
  "academyHomework",
  "wrongAnswerReview",
  "schoolSubject",
  "mockExam",
  "etc",
] as const;

/** 방해 요인 코드. REASON_LABELS 의 키와 같다. */
export const REASON_CODES = [
  "academySchedule",
  "smartphone",
  "fatigue",
  "distraction",
  "none",
] as const;

/** 컨디션 코드. BODY_CONDITIONS 와 같다. */
export const BODY_CONDITION_CODES = [
  "great",
  "normal",
  "tired",
  "exhausted",
] as const;

/**
 * 부분 제출: 실린 필드만 오늘 기록에 반영하고 나머지는 기존 값을 둔다.
 * 순공 시간은 숫자이거나 숫자 문자열이다(범위와 0 허용 여부는 서버가 본다).
 */
export const dailyRecordBody = z.object({
  studyHours: z.union([z.number(), z.string().trim().min(1)]).optional(),
  bodyCondition: z.enum(BODY_CONDITION_CODES).optional(),
  reasons: z.array(z.enum(REASON_CODES)).optional(),
  tasks: z.array(z.enum(TASK_CODES)).optional(),
  memo: z.string().optional(),
});

/** 브라우저가 보내는 모양. */
export type DailyRecordInput = z.input<typeof dailyRecordBody>;

const nullableNumber = z.number().nullable();

/** 확률 스냅샷. */
export const goalProbs = z.object({
  idealSusi: nullableNumber,
  idealJungsi: nullableNumber,
  minSusi: nullableNumber,
  minJungsi: nullableNumber,
});

/** 오늘 기록. 타이머만 쓴 날처럼 저장된 행이 없으면 recordIndex 가 null 이다. */
export const dailyRecordPayload = z.object({
  recordIndex: nullableNumber,
  recordDate: z.string(),
  studyHours: z.number(),
  bodyCondition: z.string(),
  tasks: z.array(z.string()),
  reasons: z.array(z.string()),
  memo: z.string(),
});

/** 12시간 쿨다운. 한 번도 제출한 적 없는 학생은 응답에서 null 이다. */
export const recordCooldown = z.object({
  active: z.boolean(),
  submittedAt: z.string().nullable(),
  unlocksAt: z.string().nullable(),
});

/** 잠금 중 요약 패널용. */
export const recordSummary = z.object({
  studyHours: z.number(),
  targetIdealHours: z.number(),
  targetMinHours: z.number(),
  idealRate: z.number(),
  minRate: z.number(),
  deltaIdealSusi: nullableNumber,
  deltaMinSusi: nullableNumber,
  deltaIdealJungsi: nullableNumber,
  deltaMinJungsi: nullableNumber,
});

export const tomorrowTargets = z.object({
  idealHours: z.number(),
  minHours: z.number(),
});

export const dailyRecordGetResponse = withNotAllowed(
  z.object({
    record: dailyRecordPayload.nullable(),
    probs: goalProbs,
    subjectHours: z.array(z.object({ subject: z.string(), hours: z.number() })),
    cooldown: recordCooldown.nullable(),
    summary: recordSummary.nullable(),
    tomorrowTargets,
  }),
);

export const dailyRecordPostResponse = z.object({
  record: dailyRecordPayload,
  delta: z.object({
    idealSusi: z.number(),
    idealJungsi: z.number(),
    minSusi: z.number(),
    minJungsi: z.number(),
  }),
  probs: goalProbs,
  recordCount: z.number(),
});

export type GoalProbsBlock = z.output<typeof goalProbs>;
export type GoalDailyRecord = z.output<typeof dailyRecordPayload>;
export type GoalRecordCooldown = z.output<typeof recordCooldown>;
export type GoalRecordSummary = z.output<typeof recordSummary>;
export type GoalTomorrowTargets = z.output<typeof tomorrowTargets>;
