// 학습 계획 과제 계약. GET/POST/PUT/DELETE /api/goal/plan-tasks 의 요청과 응답 스키마.
// 문제집 연결 필드끼리의 조합 규칙(페이지는 문제집이 있어야 한다 등)과 문제집 소유 확인은 서버가 도메인 규칙으로 막는다.

import { z } from "zod";
import { emptyResponse, withNotAllowed } from "./gate.js";

/** 과목 한글 라벨. api/_lib/goal/repo.ts SUBJECT_LABEL_TO_CODE 의 키와 같다(plan-tasks.test.ts 가 맞는지 본다). */
export const PLAN_TASK_SUBJECT_LABELS = [
  "국어",
  "수학",
  "영어",
  "탐구",
  "사회",
  "한국사",
  "제2외국어",
  "기타",
] as const;

export const PLAN_TASK_STATUSES = ["pending", "done", "fail"] as const;
export const PLAN_TASK_TITLE_MAX_LENGTH = 100;
export const PLAN_TASK_DURATION_MAX_MINUTES = 24 * 60;
/** GET 기간 상한(일). */
export const PLAN_TASK_MAX_RANGE_DAYS = 62;

const id = z.number().int().positive();
const planDate = z.iso.date();
const title = z.string().trim().min(1).max(PLAN_TASK_TITLE_MAX_LENGTH);
const subject = z.string().trim().pipe(z.enum(PLAN_TASK_SUBJECT_LABELS));
// 없거나 null 이면 0 분이고, 소수는 반올림한다.
const duration = z
  .number()
  .min(0)
  .max(PLAN_TASK_DURATION_MAX_MINUTES)
  .nullish()
  .transform((value) =>
    value === undefined ? undefined : Math.round(value ?? 0),
  );

const link = {
  workbookId: z.number().int().positive().nullable().optional(),
  pageFrom: z.number().int().min(1).optional(),
  pageTo: z.number().int().min(1).optional(),
};

export const planTasksQuery = z.object({ from: planDate, to: planDate });

export const planTaskCreateBody = z.object({
  planDate,
  title,
  subject,
  durationMinutes: duration,
  ...link,
  // 여러 날짜로 펼쳐 보내는 호출임을 알리는 자기신고 신호다.
  repeatSchedule: z.boolean().optional(),
});

/** 부분 수정: 실린 필드만 반영한다. */
export const planTaskUpdateBody = z.object({
  id,
  planDate: planDate.optional(),
  title: title.optional(),
  subject: subject.optional(),
  durationMinutes: duration,
  status: z.enum(PLAN_TASK_STATUSES).optional(),
  ...link,
});

export const planTaskDeleteBody = z.object({ id });

/** 브라우저가 보내는 모양. */
export type PlanTaskCreateInput = z.input<typeof planTaskCreateBody>;
export type PlanTaskUpdateInput = z.input<typeof planTaskUpdateBody>;
export type PlanTasksQueryInput = z.input<typeof planTasksQuery>;

export const planTaskSchema = z.object({
  id: z.number(),
  planDate: z.string(),
  title: z.string(),
  /** 한글 라벨. */
  subject: z.string(),
  durationMinutes: z.number(),
  status: z.enum(PLAN_TASK_STATUSES),
  /** status 에서 파생한 하위 호환 값. */
  done: z.boolean(),
  sortOrder: z.number(),
  workbookId: z.number().nullable(),
  pageFrom: z.number().nullable(),
  pageTo: z.number().nullable(),
  workbookTitle: z.string().nullable(),
});

export const planTasksListResponse = withNotAllowed(
  z.object({ tasks: z.array(planTaskSchema) }),
);
export const planTaskResponse = z.object({ task: planTaskSchema });
export const planTaskDeleteResponse = emptyResponse;

export type GoalPlanTask = z.output<typeof planTaskSchema>;
