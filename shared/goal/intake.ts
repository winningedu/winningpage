// 목표관리 온보딩 계약. POST /api/goal/intake 의 요청과 응답 스키마.
// 요청은 모양(목록 값, 타입, 필수 키)만 막는다. 점수 범위, 시각 순서, 시험 창, 컷 조회, 온보딩 상태는 서버가 도메인 규칙으로 막는다.
// 내 정보 수정(intake-update.ts)이 같은 구간 스키마를 가져다 쓴다.

import { z } from "zod";
import { studentPayload } from "./student.js";

export const SCHOOL_TYPES = [
  "general",
  "special",
  "middle",
  "elementary",
] as const;
export const GRADES = ["g1", "g2", "g3"] as const;
export const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/** 숫자이거나 숫자 문자열이다. 범위는 서버가 본다. */
const numeric = z.union([z.number(), z.string()]);

/** 목표 대학 하나. 비었는지와 길이는 서버가 본다. */
export const targetUniversity = z.object({
  university: z.string(),
  department: z.string().nullish(),
});

/** 내신. lastExam 이 비면 "전 시험 없음"이다. exams 의 키와 값은 서버가 시험 창 안에서만 읽는다. */
export const naesinInput = z.object({
  lastExam: z.string().nullish(),
  overall: numeric.nullish(),
  priorNaesinGrade: numeric.nullish(),
  exams: z.record(z.string(), z.unknown()).nullish(),
});

/** 모의고사. lastRound 가 비면 "전 회차 없음"이다. rounds 의 키와 값은 서버가 시험 창 안에서만 읽는다. */
export const mockExamInput = z.object({
  lastRound: z.string().nullish(),
  track: z.string().nullish(),
  rounds: z.record(z.string(), z.unknown()).nullish(),
});

const weekdayShape = <S extends z.ZodType>(value: S) =>
  z.object(
    Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, value])) as Record<
      (typeof WEEKDAY_KEYS)[number],
      S
    >,
  );

/** 요일 하나의 하루 일과. 시각 범위와 순서는 서버가 본다. */
export const weekScheduleDay = z.object({
  wake: numeric,
  sleep: numeric,
  hasSchool: z.boolean(),
  schoolStart: numeric,
  schoolEnd: numeric,
  academies: z.array(z.object({ start: numeric, end: numeric })),
});

export const intakeBody = z.object({
  schoolType: z.enum(SCHOOL_TYPES),
  grade: z.enum(GRADES),
  upperUniversity: targetUniversity,
  lowerUniversity: targetUniversity,
  naesin: naesinInput,
  mockExam: mockExamInput,
  studyHours: weekdayShape(numeric),
  weekSchedule: weekdayShape(weekScheduleDay),
});

/** 브라우저가 보내는 모양. */
export type IntakeInput = z.input<typeof intakeBody>;

/** 온보딩 직후 학생 본문. GET /api/goal/student 와 같은 모양에서 timeZone 만 없다. */
export const intakeStudent = studentPayload.omit({ timeZone: true });

export const intakeResponse = z.object({ student: intakeStudent });

export type GoalIntakeStudent = z.output<typeof intakeStudent>;
