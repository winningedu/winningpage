// 열공 타이머 계약. GET/POST /api/goal/timer 의 요청과 응답 스키마.
// 시각과 초는 서버가 계산한다. 요청은 action 과 과목, 목표 시간만 싣는다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

/** 과목 코드 8종. api/_lib/goal/repo.ts TIMER_SUBJECTS 와 같다(timer.test.ts 가 맞는지 본다). */
export const TIMER_SUBJECTS = [
  "korean",
  "math",
  "english",
  "science",
  "social",
  "history",
  "second_lang",
  "etc",
] as const;

const subject = z.enum(TIMER_SUBJECTS);

export type TimerSubject = z.output<typeof subject>;

export const timerBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), subject }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("heartbeat") }),
  z.object({
    action: z.literal("setTarget"),
    subject,
    targetHours: z.number().min(0).max(24),
  }),
  z.object({ action: z.literal("addSubject"), subject }),
]);

/** 브라우저가 보내는 모양. */
export type TimerBodyInput = z.input<typeof timerBody>;

const running = z.object({ subject: z.string(), startedAt: z.string() });
const target = z.object({ subject: z.string(), targetHours: z.number() });

/** 오늘(학생 현지) 요약. */
export const timerSummary = z.object({
  date: z.string(),
  serverNow: z.string(),
  running: running.nullable(),
  subjects: z.array(z.object({ subject: z.string(), seconds: z.number() })),
  totalSeconds: z.number(),
  targets: z.array(target),
  visibleSubjects: z.array(z.string()),
});

export const timerGetResponse = withNotAllowed(timerSummary);
export const timerRunningResponse = z.object({ running: running.nullable() });
export const timerTargetResponse = z.object({ target });
export const timerSubjectsResponse = z.object({
  visibleSubjects: z.array(z.string()),
});

export type TimerSummary = z.output<typeof timerSummary>;
