// 목표관리 학생 상태 계약. GET /api/goal/student 의 응답 스키마(요청 본문 없음).
// 온보딩 완료 본문(studentPayload)은 POST /api/goal/intake 의 student 필드와 같은 모양이다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

const nullableNumber = z.number().nullable();

const targetBlock = z.object({
  university: z.string(),
  department: z.string(),
  naesinCut: nullableNumber,
  jungsiCut: nullableNumber,
});

/** 이상, 최소 목표 대학. */
export const goalTargets = z.object({ ideal: targetBlock, min: targetBlock });

const probs = z.object({
  idealSusi: nullableNumber,
  idealJungsi: nullableNumber,
  minSusi: nullableNumber,
  minJungsi: nullableNumber,
});

const universityInput = z.object({
  university: z.string(),
  department: z.string(),
});

/** 온보딩을 마친 학생. buildStudentPayload() 에 학생 시간대(timeZone)를 더한 본문이다. */
export const studentPayload = z.object({
  onboarded: z.literal(true),
  timeZone: z.string(),
  status: z.string(),
  profile: z.object({
    name: z.string().nullable(),
    schoolType: z.string(),
    grade: z.string(),
    schoolCutType: z.string(),
  }),
  targets: goalTargets,
  scores: z.object({
    currentScore: nullableNumber,
    convertedGrade: nullableNumber,
    currentMogo: nullableNumber,
    remainNaesin: nullableNumber,
    remainMogo: nullableNumber,
    lastNaesinExam: z.string(),
    lastMogoExam: z.string(),
  }),
  baseProbs: probs,
  rates: z.object({
    idealSusiBonus: nullableNumber,
    idealJungsiBonus: nullableNumber,
    minSusiBonus: nullableNumber,
    minJungsiBonus: nullableNumber,
  }),
  cumulativeBonus: z.object({
    idealSusi: z.number(),
    idealJungsi: z.number(),
    minSusi: z.number(),
    minJungsi: z.number(),
  }),
  probs,
  weeklySchedule: z.record(z.string(), z.unknown()),
  weekIdeal: z.number(),
  weekMin: z.number(),
  actualStartDate: z.string().nullable(),
  recordCount: z.number(),
  lastRecordDate: z.string().nullable(),
  /** 최근 7일 순공시간 평균. 기록이 없으면 null. */
  recentAvgStudyHours: nullableNumber,
  probabilityHistory: z.array(probs.extend({ recordedAt: z.string() })),
  jungsiAvailable: z.boolean(),
  targetInput: z.object({ ideal: universityInput, min: universityInput }),
  naesinInput: z.record(z.string(), z.unknown()).nullable(),
  mockInput: z.record(z.string(), z.unknown()).nullable(),
});

/** 컷 데이터가 없어 확률을 못 낸 학생. */
export const awaitingCutsPayload = z.object({
  onboarded: z.literal(false),
  status: z.string(),
  targets: goalTargets,
  missingCuts: z.array(z.string()),
});

/** 온보딩을 시작하지 않은 학생. */
export const notOnboardedPayload = z.object({ onboarded: z.literal(false) });

export const studentResponse = withNotAllowed(
  z.union([studentPayload, awaitingCutsPayload, notOnboardedPayload]),
);

export type GoalStudentPayload = z.output<typeof studentPayload>;
export type GoalTargets = z.output<typeof goalTargets>;
