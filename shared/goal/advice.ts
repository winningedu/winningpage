// 입시 조언 계약. GET/POST /api/goal/advice 의 요청과 응답 스키마.
// source 는 조언을 만든 시점이다. intake 는 온보딩 직후, daily 는 오늘의 공부 기록 직후다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

export const ADVICE_SOURCES = ["intake", "daily"] as const;

export const adviceBody = z.object({ source: z.enum(ADVICE_SOURCES) });

/** 브라우저가 보내는 모양. */
export type AdviceBodyInput = z.input<typeof adviceBody>;

/** 조언 한 건. api/_lib/goal/advice.ts AdvicePayload 와 같다. 모델이나 규칙이 만든다. */
export const advicePayload = z.object({
  source: z.enum(ADVICE_SOURCES),
  /** ai 는 모델이, rule 은 규칙 폴백이 만들었다. */
  origin: z.enum(["ai", "rule"]),
  probabilitySummary: z.string(),
  sections: z.array(z.object({ label: z.string(), body: z.string() })),
  majorTips: z.array(z.object({ department: z.string(), text: z.string() })),
});

/** GET: 오늘자(없으면 가장 최근) 캐시. *For 는 각 조언의 생성일(학생 현지 날짜)이다. */
export const adviceGetResponse = withNotAllowed(
  z.object({
    intake: advicePayload.nullable(),
    daily: advicePayload.nullable(),
    intakeFor: z.string().nullable(),
    dailyFor: z.string().nullable(),
  }),
);

export const advicePostResponse = advicePayload;

export type GoalAdvicePayload = z.output<typeof advicePayload>;
