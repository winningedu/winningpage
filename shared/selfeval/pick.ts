// 자기평가서 활동 선택 계약. POST /api/selfeval/pick-records 의 요청 스키마(action 별)와 응답 스키마.
// 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.
// 직접 입력의 활동 이름, 과목 필수는 도메인 규칙이라 스키마가 아니라 서버 핸들러가 본다(ACTIVITY_NAME_REQUIRED, SUBJECT_REQUIRED).

import { z } from "zod";
import { highGradeSchema, semesterSchema } from "./contract.js";
import { activityRecordSchema, growthPlanItemRefSchema } from "./session.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

const sessionId = z.string().min(1);

/** 비워 둔 항목은 키가 없거나 null 로 온다. 비어 있다는 사실만 빈 문자열로 옮긴다. */
const manualText = z
  .string()
  .nullish()
  .transform((text) => text ?? "");

export const manualInputSchema = z.object({
  activityName: manualText,
  subjectOrArea: manualText,
  gradeLabel: highGradeSchema.nullish().transform((v) => v ?? null),
  semester: semesterSchema.nullish().transform((v) => v ?? null),
  motive: manualText,
  concept: manualText,
  action: manualText,
  method: manualText,
  result: manualText,
  role: manualText,
  limitation: manualText,
  next: manualText,
});

const linkPair = { fromId: z.string().min(1), toId: z.string().min(1) };

export const pickBody = z.discriminatedUnion("action", [
  z.object({ sessionId, action: z.literal("list") }),
  z.object({ sessionId, action: z.literal("link") }),
  z.object({
    sessionId,
    action: z.literal("select"),
    coreId: z.string(),
    supportIds: z.array(z.string()).default([]),
  }),
  z.object({
    sessionId,
    action: z.literal("manual"),
    input: manualInputSchema,
  }),
  z.object({ sessionId, action: z.literal("delete-link"), ...linkPair }),
  z.object({ sessionId, action: z.literal("confirm-link"), ...linkPair }),
  z.object({
    sessionId,
    action: z.literal("add-link"),
    ...linkPair,
    type: z.string().min(1),
    note: z.string(),
  }),
]);

export type PickBody = z.output<typeof pickBody>;
/** 브라우저가 보내는 직접 입력의 모양. */
export type ManualInputBody = z.input<typeof manualInputSchema>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const LINK_TYPES = [
  "inherit",
  "deepen",
  "borrow_method",
  "complement",
  "background",
  "area_extend",
  "grade_continue",
] as const;
const linkTypeSchema = z.enum(LINK_TYPES);
const linkStrengthSchema = z.enum(["explicit", "implicit"]);

const fitSignalKeySchema = z.enum([
  "same_subject",
  "has_judgment",
  "has_limitation",
  "numbers_two_plus",
  "self_made",
  "too_short",
  "repeated_topic",
  "year_gap",
  "aligned_signal",
  "conflicting_signal",
  "fills_weak_axis",
]);

const fitResultSchema = z.looseObject({
  activityId: z.string(),
  score: z.number(),
  signals: z.array(
    z.looseObject({
      key: fitSignalKeySchema,
      hit: z.boolean(),
      delta: z.number(),
    }),
  ),
  reasons: z.array(z.string()),
});

const candidateRowSchema = z.looseObject({
  activity: activityRecordSchema,
  fit: fitResultSchema.nullable(),
  unavailableReason: z.string().nullable(),
  alreadyUsed: z.boolean(),
  role: z.enum(["core", "support"]).nullable(),
  recordStatus: z.enum(["completed", "in_progress", "plan"]).optional(),
  submittedAt: z.string().optional(),
  linkState: z
    .looseObject({
      linked: z.boolean(),
      hop: z.number().nullable(),
      type: linkTypeSchema.nullable(),
      strength: linkStrengthSchema.nullable(),
      confirmed: z.boolean(),
    })
    .nullish(),
  bonus: z.number().optional(),
  contribution: z.number().optional(),
  selectionReasons: z.array(z.string()).optional(),
});

const recordLinkSchema = z.looseObject({
  fromId: z.string(),
  toId: z.string(),
  type: linkTypeSchema,
  strength: linkStrengthSchema,
  source: z.enum(["model", "student"]),
  confirmed: z.boolean(),
  deleted: z.boolean(),
  note: z.string().nullable(),
  quoteFrom: z.string().nullable(),
  quoteTo: z.string().nullable(),
});

const pickSelectionSchema = z.looseObject({
  coreId: z.string(),
  supportIds: z.array(z.string()),
});

/** list 와 연계 판정, 연계 편집이 같이 돌려주는 본문. */
export const pickListResponseSchema = z.looseObject({
  candidates: z.array(candidateRowSchema),
  selection: pickSelectionSchema.nullable(),
  auto: z
    .looseObject({
      coreId: z.string().nullable(),
      supportIds: z.array(z.string()),
      coreMismatch: z.boolean(),
      noneAboveThreshold: z.boolean(),
    })
    .nullable(),
  sourceCounts: z.looseObject({
    performance: z.number(),
    deep: z.number(),
    manual: z.number(),
    total: z.number(),
  }),
  direction: z.looseObject({ mismatch: z.boolean() }).nullable(),
  planCandidates: z.array(growthPlanItemRefSchema),
  planItem: growthPlanItemRefSchema.nullable(),
  growthApplied: z.boolean(),
  currentStep: z.literal([0, 1, 2, 3, 4, 5, 6]),
  links: z.array(recordLinkSchema),
  linkStatus: z.enum(["pending", "ok", "unchecked"]),
  linkUnchecked: z.boolean(),
  maxSelect: z.number(),
  excludedIds: z.array(z.string()),
});

/** link 만 cached, attempts, linkError 를 더한다. */
export const pickLinkResponseSchema = pickListResponseSchema.extend({
  cached: z.boolean().optional(),
  attempts: z.number().optional(),
  linkError: z.string().optional(),
});

export const pickSelectResponseSchema = z.looseObject({
  selection: pickSelectionSchema,
  coreMismatch: z.boolean(),
  warnings: z.array(z.string()),
  excludedIds: z.array(z.string()),
  maxSelect: z.number(),
  currentStep: z.literal(2),
});

export const pickManualResponseSchema = z.looseObject({
  activityRecordId: z.string(),
  selection: pickSelectionSchema,
  currentStep: z.literal(3),
});
