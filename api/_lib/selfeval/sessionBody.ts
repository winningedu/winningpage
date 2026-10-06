// 세션 생성과 수정 바디 검증, insert 행 조립(명세 No.20~25, 101, 105 및 계획서 §2 2, 3).
// 순수 모듈이다. DB 접근은 api/_lib/selfeval/db.ts 와 핸들러가 한다.

import type { SessionRow } from "./rows.js";
import {
  AREA_LABELS,
  type Area,
  type CareerInfo,
  type GrowthSnapshot,
  type HighGrade,
  type TargetCharsMode,
} from "./types.js";

export type SessionInput = {
  academicYear: number;
  gradeLabel: HighGrade;
  semester: 1 | 2;
  area: Area;
  subject: string | null;
  activityName: string | null;
  schoolPrompt: string;
  teacherNote: string | null;
  targetChars: number | null;
  targetCharsMode: TargetCharsMode;
  career: CareerInfo;
  growthApplied: boolean;
  planItemId: string | null;
};

export type SessionBodyErrorCode =
  | "INVALID_BODY"
  | "ACADEMIC_YEAR_INVALID"
  | "GRADE_INVALID"
  | "SEMESTER_INVALID"
  | "AREA_INVALID"
  | "SUBJECT_REQUIRED"
  | "ACTIVITY_NAME_REQUIRED"
  | "PROMPT_REQUIRED"
  | "TEACHER_NOTE_INVALID"
  | "TARGET_CHARS_INVALID"
  | "TARGET_MODE_INVALID"
  | "CAREER_INVALID"
  | "GROWTH_APPLIED_INVALID"
  | "PLAN_ITEM_INVALID";

type Fail = { ok: false; code: SessionBodyErrorCode; message: string };
type Parsed<T> = { ok: true; value: T } | Fail;

const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];
const AREAS = Object.keys(AREA_LABELS) as Area[];
const MODES: readonly TargetCharsMode[] = ["with_space", "without_space"];
const MAX_UNIVERSITIES = 2;
const TARGET_CHARS_MIN = 100;
const TARGET_CHARS_MAX = 3000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (code: SessionBodyErrorCode, message: string): Fail => ({
  ok: false,
  code,
  message,
});

/** 문자열이면 trim, 비면 null. 문자열도 null 도 아니면 undefined(잘못된 타입). */
function trimmedOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseCareer(v: unknown): Parsed<CareerInfo> {
  const bad = fail("CAREER_INVALID", "진로 정보 형식이 올바르지 않아요.");
  if (!isRecord(v)) return bad;
  const career = trimmedOrNull(v.career);
  const department = trimmedOrNull(v.department);
  if (career === undefined || department === undefined) return bad;
  const raw = v.universities ?? [];
  if (!Array.isArray(raw) || raw.some((u) => typeof u !== "string")) return bad;
  const universities = (raw as string[])
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (universities.length > MAX_UNIVERSITIES) {
    return fail(
      "CAREER_INVALID",
      `희망 대학은 최대 ${MAX_UNIVERSITIES}개까지 입력할 수 있어요.`,
    );
  }
  return { ok: true, value: { career, department, universities } };
}

type FieldParsers = {
  [K in keyof SessionInput]: (v: unknown) => Parsed<SessionInput[K]>;
};

const PARSERS: FieldParsers = {
  academicYear: (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100
      ? { ok: true, value: v }
      : fail("ACADEMIC_YEAR_INVALID", "학년도를 확인해 주세요."),
  gradeLabel: (v) =>
    GRADES.includes(v as HighGrade)
      ? { ok: true, value: v as HighGrade }
      : fail("GRADE_INVALID", "학년을 확인해 주세요."),
  semester: (v) =>
    v === 1 || v === 2
      ? { ok: true, value: v }
      : fail("SEMESTER_INVALID", "학기를 확인해 주세요."),
  area: (v) =>
    AREAS.includes(v as Area)
      ? { ok: true, value: v as Area }
      : fail("AREA_INVALID", "작성 영역을 확인해 주세요."),
  // 영역별 필수 여부는 모든 필드가 모인 뒤에 본다(수정 바디는 일부만 오기 때문).
  subject: (v) => {
    const t = trimmedOrNull(v);
    return t === undefined
      ? fail("SUBJECT_REQUIRED", "과목 형식이 올바르지 않아요.")
      : { ok: true, value: t };
  },
  activityName: (v) => {
    const t = trimmedOrNull(v);
    return t === undefined
      ? fail("ACTIVITY_NAME_REQUIRED", "활동명 형식이 올바르지 않아요.")
      : { ok: true, value: t };
  },
  schoolPrompt: (v) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === ""
      ? fail("PROMPT_REQUIRED", "학교에서 받은 문항을 입력해 주세요.")
      : { ok: true, value: t };
  },
  teacherNote: (v) => {
    const t = trimmedOrNull(v);
    return t === undefined
      ? fail("TEACHER_NOTE_INVALID", "교사 안내 형식이 올바르지 않아요.")
      : { ok: true, value: t };
  },
  targetChars: (v) =>
    v === null ||
    (typeof v === "number" &&
      Number.isInteger(v) &&
      v >= TARGET_CHARS_MIN &&
      v <= TARGET_CHARS_MAX)
      ? { ok: true, value: v }
      : fail(
          "TARGET_CHARS_INVALID",
          `목표 글자 수는 ${TARGET_CHARS_MIN}자에서 ${TARGET_CHARS_MAX}자 사이로 입력해 주세요.`,
        ),
  targetCharsMode: (v) =>
    MODES.includes(v as TargetCharsMode)
      ? { ok: true, value: v as TargetCharsMode }
      : fail("TARGET_MODE_INVALID", "글자 수 기준을 확인해 주세요."),
  career: parseCareer,
  growthApplied: (v) =>
    typeof v === "boolean"
      ? { ok: true, value: v }
      : fail("GROWTH_APPLIED_INVALID", "성장설계 연동 여부를 확인해 주세요."),
  planItemId: (v) => {
    const t = trimmedOrNull(v);
    return t === undefined
      ? fail("PLAN_ITEM_INVALID", "실행계획 항목 형식이 올바르지 않아요.")
      : { ok: true, value: t };
  },
};

const FIELD_KEYS = Object.keys(PARSERS) as (keyof SessionInput)[];

/** 생략해도 되는 필드. 나머지는 생성 때 반드시 보내야 한다. */
const OPTIONAL_ON_CREATE: ReadonlySet<keyof SessionInput> = new Set([
  "subject",
  "activityName",
  "teacherNote",
  "planItemId",
]);

function parsePartial(
  body: Record<string, unknown>,
  keys: readonly (keyof SessionInput)[],
): Parsed<Partial<SessionInput>> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const parser = PARSERS[key] as (v: unknown) => Parsed<unknown>;
    const r = parser(body[key]);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  return { ok: true, value: out as Partial<SessionInput> };
}

function crossCheck(input: Partial<SessionInput>): Fail | null {
  if (input.area === "subject") {
    if (!input.subject) {
      return fail("SUBJECT_REQUIRED", "과목을 입력해 주세요.");
    }
  } else if (!input.activityName) {
    return fail("ACTIVITY_NAME_REQUIRED", "활동명을 입력해 주세요.");
  }
  return null;
}

export type SessionCreateValidation = { ok: true; input: SessionInput } | Fail;

export function validateSessionCreateBody(
  body: unknown,
): SessionCreateValidation {
  if (!isRecord(body))
    return fail("INVALID_BODY", "요청 형식이 올바르지 않아요.");
  const keys = FIELD_KEYS.filter(
    (k) => !(OPTIONAL_ON_CREATE.has(k) && body[k] === undefined),
  );
  const parsed = parsePartial(body, keys);
  if (!parsed.ok) return parsed;
  const input = { ...parsed.value } as Partial<SessionInput>;
  for (const k of OPTIONAL_ON_CREATE) {
    if (input[k] === undefined) (input as Record<string, unknown>)[k] = null;
  }
  const crossed = crossCheck(input);
  if (crossed) return crossed;
  // 영역에 맞지 않는 쪽 필드는 버려 두 값이 함께 남지 않게 한다.
  if (input.area === "subject") input.activityName = null;
  else input.subject = null;
  return { ok: true, input: input as SessionInput };
}

export type SessionAction = "create" | "update" | "discard";

export function readSessionAction(body: unknown): SessionAction | null {
  if (!isRecord(body)) return null;
  const { action } = body;
  return action === "create" || action === "update" || action === "discard"
    ? action
    : null;
}

export function validateSessionDiscardBody(
  body: unknown,
): { ok: true; sessionId: string } | Fail {
  if (
    !isRecord(body) ||
    typeof body.sessionId !== "string" ||
    !body.sessionId
  ) {
    return fail("INVALID_BODY", "sessionId 가 필요해요.");
  }
  return { ok: true, sessionId: body.sessionId };
}

export type SessionUpdateValidation =
  | { ok: true; sessionId: string; patch: Partial<SessionInput> }
  | Fail;

export function validateSessionUpdateBody(
  body: unknown,
): SessionUpdateValidation {
  if (
    !isRecord(body) ||
    typeof body.sessionId !== "string" ||
    !body.sessionId
  ) {
    return fail("INVALID_BODY", "sessionId 가 필요해요.");
  }
  const keys = FIELD_KEYS.filter((k) => body[k] !== undefined);
  const parsed = parsePartial(body, keys);
  if (!parsed.ok) return parsed;
  return { ok: true, sessionId: body.sessionId, patch: parsed.value };
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
    ...(row.school_prompt !== null && { schoolPrompt: row.school_prompt }),
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

/** 기존 값에 patch 를 덮고 생성과 같은 규칙으로 다시 검증한다. */
export function applySessionPatch(
  current: Partial<SessionInput>,
  patch: Partial<SessionInput>,
): SessionCreateValidation {
  return validateSessionCreateBody({ ...current, ...patch });
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
