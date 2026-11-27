// 자기평가서 세션 계약. POST /api/selfeval/session 의 요청 스키마(생성, 수정, 파기)와,
// 세션을 돌려주는 모든 응답(세션 라우트, 조회 상세)이 쓰는 세션과 활동의 응답 스키마.
// 응답 객체는 looseObject 라 서버가 필드를 더해도 브라우저가 거절하지 않는다.

import { z } from "zod";
import {
  ANALYSIS_FIELDS,
  areaSchema,
  GROWTH_STAGES,
  highGradeSchema,
  modelStepKeySchema,
  semesterSchema,
  sessionStatusSchema,
  sessionStepSchema,
  targetCharsModeSchema,
} from "./contract.js";

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

export const TARGET_CHARS_MIN = 100;
export const TARGET_CHARS_MAX = 3000;
export const MAX_UNIVERSITIES = 2;

/** 문자열이면 trim 하고, 비거나 생략이거나 null 이면 null. 문자열도 null 도 아니면 거절. */
const nullableText = z
  .string()
  .trim()
  .transform((text) => (text === "" ? null : text))
  .nullish()
  .transform((text) => text ?? null);

const careerSchema = z.object({
  career: nullableText,
  department: nullableText,
  universities: z
    .array(z.string())
    .nullish()
    .transform((list) =>
      (list ?? []).map((name) => name.trim()).filter((name) => name !== ""),
    )
    .refine((list) => list.length <= MAX_UNIVERSITIES, {
      message: `희망 대학은 최대 ${MAX_UNIVERSITIES}개까지 입력할 수 있어요.`,
    }),
});

// 생략해도 되는 필드(subject, activityName, schoolPrompt, teacherNote, planItemId)는 null 로 채운다. 나머지는 생성 때 반드시 보낸다.
const basicsShape = {
  academicYear: z.int().min(2000).max(2100),
  gradeLabel: highGradeSchema,
  semester: semesterSchema,
  area: areaSchema,
  subject: nullableText,
  activityName: nullableText,
  schoolPrompt: nullableText,
  teacherNote: nullableText,
  targetChars: z.int().min(TARGET_CHARS_MIN).max(TARGET_CHARS_MAX).nullable(),
  targetCharsMode: targetCharsModeSchema,
  career: careerSchema,
  growthApplied: z.boolean(),
  planItemId: nullableText,
};

type BasicsCross = {
  area: (typeof areaSchema)["_output"];
  subject: string | null;
  activityName: string | null;
};

/** 영역별 필수 여부. 교과는 과목, 창체는 활동명이 있어야 한다. */
function crossCheck(value: BasicsCross, ctx: z.RefinementCtx): void {
  if (value.area === "subject" && !value.subject) {
    ctx.addIssue({
      code: "custom",
      path: ["subject"],
      message: "과목을 입력해 주세요.",
    });
  }
  if (value.area !== "subject" && !value.activityName) {
    ctx.addIssue({
      code: "custom",
      path: ["activityName"],
      message: "활동명을 입력해 주세요.",
    });
  }
}

const basicsObject = z.object(basicsShape);

/** 기본 입력 전체. 수정은 세션의 기존 값에 patch 를 덮은 뒤 이 스키마로 다시 검증한다. */
export const sessionBasicsSchema = basicsObject.superRefine(crossCheck);

const sessionIdSchema = z.string().min(1);

export const sessionCreateBody = basicsObject
  .extend({ action: z.literal("create") })
  .superRefine(crossCheck);

/** 수정 바디는 보낸 필드만 담는다. 영역 규칙은 합친 뒤에 본다. */
export const sessionUpdateBody = basicsObject.partial().extend({
  action: z.literal("update"),
  sessionId: sessionIdSchema,
});

export const sessionDiscardBody = z.object({
  action: z.literal("discard"),
  sessionId: sessionIdSchema,
});

export const sessionBody = z.discriminatedUnion("action", [
  sessionCreateBody,
  sessionUpdateBody,
  sessionDiscardBody,
]);

/** 브라우저가 보내는 모양(SessionInput). */
export type SessionBasicsInput = z.input<typeof sessionBasicsSchema>;
/** 서버가 저장하는 모양. */
export type SessionBasics = z.output<typeof sessionBasicsSchema>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const stepIssueSchema = z.looseObject({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});
export const stepTerminalSchema = z.looseObject({
  reason: z.string(),
  at: z.string(),
  step: modelStepKeySchema.nullable(),
});
export const careerInfoSchema = z.looseObject({
  career: z.string().nullable(),
  department: z.string().nullable(),
  universities: z.array(z.string()),
});
export const replyPendingSchema = z.looseObject({
  itemId: z.string(),
  refId: z.string(),
  failedAt: z.string(),
  lastError: z.string(),
});

export const growthPlanItemRefSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  axis: z.string().nullable(),
  category: z.string().nullable(),
});
const growthWeakAxisSchema = z.looseObject({
  axis: z.string(),
  name: z.string(),
  count: z.number(),
  required: z.number(),
  guideline: z.string(),
});
const growthStageSchema = z.enum(GROWTH_STAGES);

/** 성장설계 수신 8종. 세션 생성 때 growth_snapshot 에 고정한다. */
export const growthSnapshotSchema = z.looseObject({
  reportId: z.string(),
  issuedAt: z.string(),
  narrativeTheme: z.string().nullable(),
  gradeSubthemes: z.array(
    z.looseObject({
      grade: highGradeSchema,
      stage: growthStageSchema,
      text: z.string(),
    }),
  ),
  stage: growthStageSchema.nullable(),
  weakAxes: z.array(growthWeakAxisSchema),
  alignedSignals: z.array(z.string()),
  conflictingSignals: z.array(z.string()),
  planItems: z.array(growthPlanItemRefSchema),
});

export const sessionViewSchema = z.looseObject({
  id: z.string(),
  status: sessionStatusSchema,
  currentStep: sessionStepSchema,
  progress: z.unknown(),
  academicYear: z.number().nullable(),
  gradeLabel: highGradeSchema.nullable(),
  semester: semesterSchema.nullable(),
  area: areaSchema.nullable(),
  subject: z.string().nullable(),
  activityName: z.string().nullable(),
  schoolPrompt: z.string().nullable(),
  teacherNote: z.string().nullable(),
  targetChars: z.number().nullable(),
  targetCharsMode: targetCharsModeSchema,
  career: careerInfoSchema,
  growthApplied: z.boolean(),
  growthSnapshot: growthSnapshotSchema.nullable(),
  planItemId: z.string().nullable(),
  replyPending: replyPendingSchema.nullable(),
  regenerateCount: z.number(),
  terminal: stepTerminalSchema.nullable(),
  lastActivityAt: z.string(),
  completedAt: z.string().nullable(),
});

const analysisFieldSchema = z.enum(ANALYSIS_FIELDS);
const analysisSchema = z.looseObject({
  values: z.record(analysisFieldSchema, z.string()),
  sources: z.record(
    analysisFieldSchema,
    z.enum(["record", "student", "empty"]),
  ),
  conflicts: z.array(
    z.looseObject({
      kind: z.enum(["numbers", "period"]),
      a: z.looseObject({ activityId: z.string(), text: z.string() }),
      b: z.looseObject({ activityId: z.string(), text: z.string() }),
      resolved: z.string().nullable(),
    }),
  ),
});

export const activityRecordSchema = z.looseObject({
  id: z.string(),
  sourceProgram: z.enum(["performance", "deep", "self", "manual", "upload"]),
  status: z.enum(["planned", "draft", "confirmed", "final"]),
  gradeLabel: highGradeSchema.nullable(),
  semester: semesterSchema.nullable(),
  subjectGroup: z.string().nullable(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  concept: z.string().nullable(),
  method: z.string().nullable(),
  result: z.string().nullable(),
  limitation: z.string().nullable(),
  numbers: z.unknown(),
  sources: z.unknown(),
  createdAt: z.string(),
  submittedAt: z.string().nullish(),
  recordStatus: z.enum(["completed", "in_progress", "plan"]).nullish(),
  summary: z.string().nullish(),
  reflection: z.string().nullish(),
  parentRecordId: z.string().nullish(),
  courseName: z.string().nullish(),
  entryKind: z.enum(["performance", "deep", "activity"]).nullish(),
});

export const sessionActivityViewSchema = z.looseObject({
  activityRecordId: z.string(),
  role: z.enum(["core", "support"]),
  fitScore: z.number().nullable(),
  fitReasons: z.unknown(),
  analysis: analysisSchema.nullable(),
  analysisSource: z.enum(["model", "student"]).nullable(),
  record: activityRecordSchema,
});

export const reportViewSchema = z.looseObject({
  id: z.string(),
  revision: z.number(),
  sections: z.unknown(),
  charCount: z
    .looseObject({ withSpace: z.number(), withoutSpace: z.number() })
    .nullable(),
  score: z.number().nullable(),
  mandatoryFixes: z.unknown(),
  createdAt: z.string(),
});

/** 학생이 확인했고 포함으로 둔 수기 메모. 문장 근거로 고를 수 있다. */
export const evidenceMemoViewSchema = z.looseObject({
  id: z.string(),
  writtenAt: z.string().nullable(),
  text: z.string(),
});

/** 세션 생성과 수정의 응답. 모양은 조회 상세의 session 과 같다. */
export const sessionResponseSchema = z.looseObject({
  session: sessionViewSchema,
});

/** 파기의 응답. 돌려줄 값이 없다. */
export const sessionDiscardResponseSchema = z.looseObject({});

export const sessionDetailResponseSchema = z.looseObject({
  session: sessionViewSchema,
  activities: z.array(sessionActivityViewSchema),
  memos: z.array(evidenceMemoViewSchema),
  reports: z.looseObject({
    generation: reportViewSchema.nullable(),
    edited: reportViewSchema.nullable(),
    verification: reportViewSchema.nullable(),
    final: reportViewSchema.nullable(),
  }),
  regenerationsLeft: z.number(),
  current: reportViewSchema.nullable(),
});

export type StepIssueView = z.output<typeof stepIssueSchema>;
