// 중요일정 계약. GET/POST/PUT/DELETE /api/goal/schedules 의 요청과 응답 스키마.

import { z } from "zod";
import { emptyResponse, withNotAllowed } from "./gate.js";

/** sql/74_goal_schedules.sql goal_schedules_category_check 와 같은 4종. */
export const SCHEDULE_CATEGORIES = [
  "performance",
  "exam",
  "deadline",
  "etc",
] as const;

export const SCHEDULE_TITLE_MAX_LENGTH = 100;
export const SCHEDULE_MEMO_MAX_LENGTH = 1000;

// 과거 날짜도 허용한다(지난 일정을 기록하고 수정할 수 있어야 한다). 달력에 있는 날짜인지만 본다.
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()));

const fields = {
  title: z.string().trim().min(1).max(SCHEDULE_TITLE_MAX_LENGTH),
  category: z.enum(SCHEDULE_CATEGORIES),
  dueDate,
  // 메모는 없어도 된다. 길면 잘라 저장한다(오류로 막지 않는다).
  memo: z
    .string()
    .nullish()
    .transform((value) =>
      (value ?? "").trim().slice(0, SCHEDULE_MEMO_MAX_LENGTH),
    ),
};

const id = z.number().int().positive();

export const scheduleCreateBody = z.object(fields);
export const scheduleUpdateBody = z.object({ id, ...fields });
export const scheduleDeleteBody = z.object({ id });

/** 브라우저가 보내는 모양. */
export type ScheduleCreateInput = z.input<typeof scheduleCreateBody>;
export type ScheduleUpdateInput = z.input<typeof scheduleUpdateBody>;
export type ScheduleDeleteInput = z.input<typeof scheduleDeleteBody>;

export const scheduleSchema = z.object({
  id: z.number(),
  title: z.string(),
  category: z.string(),
  dueDate: z.string(),
  memo: z.string(),
});

export const schedulesListResponse = withNotAllowed(
  z.object({ schedules: z.array(scheduleSchema) }),
);
export const scheduleResponse = z.object({ schedule: scheduleSchema });
export const scheduleDeleteResponse = emptyResponse;

export type GoalSchedule = z.output<typeof scheduleSchema>;
