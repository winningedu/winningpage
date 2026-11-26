// 세션 기본 입력의 서버 쪽 규칙: 수정할 때 합친 값 재검증, insert 행 조립(명세 No.20~25, 101, 105 및 계획서 §2 2, 3).
// 요청 형식 검증은 shared/selfeval/session.ts 의 스키마가 한다. 순수 모듈이고 DB 접근은 api/_lib/selfeval/db.ts 와 라우트가 한다.

import {
  type ProblemFieldError,
  zodIssuesToErrors,
} from "../../../shared/http/problem.js";
import {
  type SessionBasics,
  sessionBasicsSchema,
} from "../../../shared/selfeval/session.js";
import type { SessionRow } from "./rows.js";
import type { CareerInfo, GrowthSnapshot } from "./types.js";

export type SessionInput = SessionBasics;

/** 영역에 맞지 않는 쪽 필드는 버려 두 값이 함께 남지 않게 한다. */
export function normalizeBasics(input: SessionInput): SessionInput {
  return input.area === "subject"
    ? { ...input, activityName: null }
    : { ...input, subject: null };
}

/** 세션 행에서 SessionInput 모양을 꺼낸다. 비어 있는 필수 컬럼은 undefined 로 두어 재검증에서 걸린다. */
export function sessionToInput(row: SessionRow): Partial<SessionInput> {
  const career = row.career as Partial<CareerInfo>;
  return {
    ...(row.academic_year !== null && { academicYear: row.academic_year }),
    ...(row.grade_label !== null && { gradeLabel: row.grade_label }),
    ...(row.semester !== null && { semester: row.semester }),
    ...(row.area !== null && { area: row.area }),
    subject: row.subject,
    activityName: row.activity_name,
    schoolPrompt: row.school_prompt,
    teacherNote: row.teacher_note,
    targetChars: row.target_chars,
    targetCharsMode: row.target_chars_mode,
    career: {
      career: career.career ?? null,
      department: career.department ?? null,
      universities: career.universities ?? [],
    },
    growthApplied: row.growth_applied,
    planItemId: row.plan_item_id,
  };
}

export type SessionCreateValidation =
  | { ok: true; input: SessionInput }
  | { ok: false; errors: ProblemFieldError[] };

/** 기존 값에 patch 를 덮고 생성과 같은 규칙으로 다시 검증한다. */
export function applySessionPatch(
  current: Partial<SessionInput>,
  patch: Partial<SessionInput>,
): SessionCreateValidation {
  const parsed = sessionBasicsSchema.safeParse({ ...current, ...patch });
  return parsed.success
    ? { ok: true, input: normalizeBasics(parsed.data) }
    : { ok: false, errors: zodIssuesToErrors(parsed.error.issues) };
}

export type PlanItemValidation =
  | { ok: true }
  | { ok: false; code: "PLAN_ITEM_INVALID"; message: string };

function planItemInSnapshot(
  planItemId: string | null,
  snapshot: GrowthSnapshot | null,
): boolean {
  if (planItemId === null) return false;
  return snapshot?.planItems.some((p) => p.id === planItemId) === true;
}

export function validatePlanItem(
  input: Pick<SessionInput, "planItemId">,
  snapshot: GrowthSnapshot | null,
): PlanItemValidation {
  if (input.planItemId === null) return { ok: true };
  if (planItemInSnapshot(input.planItemId, snapshot)) return { ok: true };
  return {
    ok: false,
    code: "PLAN_ITEM_INVALID",
    message: "선택한 실행계획 항목을 쓸 수 없어요.",
  };
}

function basicsColumns(input: SessionInput) {
  return {
    academic_year: input.academicYear,
    grade_label: input.gradeLabel,
    semester: input.semester,
    area: input.area,
    subject: input.subject,
    activity_name: input.activityName,
    school_prompt: input.schoolPrompt,
    teacher_note: input.teacherNote,
    target_chars: input.targetChars,
    target_chars_mode: input.targetCharsMode,
    career: input.career,
  };
}

export function buildSessionRow(
  input: SessionInput,
  userId: string,
  growth: { snapshot: GrowthSnapshot | null },
) {
  const { snapshot } = growth;
  return {
    profile_id: userId,
    status: "draft" as const,
    current_step: 1,
    ...basicsColumns(input),
    growth_applied: snapshot !== null && input.growthApplied,
    growth_report_id: snapshot?.reportId ?? null,
    growth_snapshot: snapshot,
    plan_item_id: planItemInSnapshot(input.planItemId, snapshot)
      ? input.planItemId
      : null,
  };
}

/** 기본 입력 수정용 update 컬럼. 스냅샷은 생성 때 고정한 세션의 것을 쓴다. */
export function buildSessionPatch(input: SessionInput, session: SessionRow) {
  const snapshot = session.growth_snapshot;
  return {
    ...basicsColumns(input),
    growth_applied: snapshot !== null && input.growthApplied,
    plan_item_id: planItemInSnapshot(input.planItemId, snapshot)
      ? input.planItemId
      : null,
  };
}

/** 기본 입력은 활동을 고르기 전(단계 1 이하)에만 고친다. 그 뒤에는 파기하고 새로 시작한다. */
export function canEditBasics(
  session: Pick<SessionRow, "status" | "current_step">,
): boolean {
  return (
    (session.status === "draft" || session.status === "in_progress") &&
    session.current_step <= 1
  );
}
