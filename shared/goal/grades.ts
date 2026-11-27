// 성적 관리 계약. GET/POST/PUT/DELETE /api/goal/grades 의 요청과 응답 스키마.
// 요청은 모양(유형, 문자열, 객체)만 막는다. 점수 범위(내신 1~9 등급, 모의고사 0~100 백분위), 회차 이름 규칙, 온보딩 상태는 서버가 도메인 규칙으로 막는다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

export const GRADE_TYPES = ["naesin", "mock"] as const;

const type = z.enum(GRADE_TYPES);

/** 과목 점수는 숫자이거나 숫자 문자열이다. 범위는 서버가 본다. */
const subjectScores = z.record(z.string(), z.union([z.number(), z.string()]));

/** 내신은 enteredAt(입력일), 모의고사는 examDate(응시일)를 싣는다. */
export const gradeEntry = z.object({
  term: z.string(),
  enteredAt: z.string().optional(),
  examDate: z.string().optional(),
  subjects: subjectScores,
});

export const gradeCreateBody = z.object({ type, entry: gradeEntry });
export const gradeUpdateBody = z.object({
  type,
  /** 수정할 회차의 기존 이름. */
  term: z.string(),
  entry: gradeEntry,
});
export const gradeDeleteBody = z.object({ type, term: z.string() });

/** 브라우저가 보내는 모양. */
export type GoalGradeEntryInput = z.input<typeof gradeEntry>;
export type GoalGradeType = z.input<typeof type>;

/** 저장된 회차 하나. 온보딩이 쓰는 jsonb 와 같은 어휘(value, none)를 쓴다. */
export const gradeRecord = z.object({
  term: z.string(),
  enteredAt: z.string().optional(),
  examDate: z.string().optional(),
  subjects: subjectScores,
  value: z.number(),
  none: z.boolean(),
  recordedAt: z.string(),
});

export const gradesListResponse = withNotAllowed(
  z.union([
    z.object({ onboarded: z.literal(false) }),
    z.object({
      onboarded: z.literal(true),
      naesinRecords: z.array(gradeRecord),
      mockRecords: z.array(gradeRecord),
    }),
  ]),
);
export const gradeWriteResponse = z.object({
  record: gradeRecord,
  records: z.array(gradeRecord),
});
export const gradeDeleteResponse = z.object({ records: z.array(gradeRecord) });

export type GoalGradeRecord = z.output<typeof gradeRecord>;
