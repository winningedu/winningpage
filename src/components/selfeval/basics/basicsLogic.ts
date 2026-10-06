import type { ApiResult } from "@/lib/growth/apiResult";
import type {
  Area,
  EntryResponse,
  HighGrade,
  SessionInput,
  SessionView,
  TargetCharsMode,
} from "@/lib/selfeval/types";
import { DEFAULT_TARGET_CHARS } from "@/lib/selfeval/types";

// 기본 입력 화면 순수 로직(명세 No.20~25, 68, 72, 74). 폼 상태는 입력 칸 그대로의 문자열이고,
// 검증을 통과한 뒤에만 buildCreateInput 으로 서버 바디 모양으로 바꾼다.

type Entry = EntryResponse["entry"];

export const GRADE_OPTIONS: readonly HighGrade[] = ["고1", "고2", "고3"];
export const SEMESTER_OPTIONS = [1, 2] as const;
export const MAX_UNIVERSITIES = 2;
export const TARGET_CHARS_MIN = 100;
export const TARGET_CHARS_MAX = 3000;

export type BasicsForm = {
  academicYear: string;
  gradeLabel: HighGrade | "";
  semester: "1" | "2" | "";
  area: Area;
  subject: string;
  activityName: string;
  schoolPrompt: string;
  teacherNote: string;
  targetChars: string;
  targetCharsMode: TargetCharsMode;
  career: string;
  department: string;
  universities: string[];
  growthApplied: boolean;
  planItemId: string | null;
};

export type BasicsErrors = Partial<
  Record<
    | "academicYear"
    | "gradeLabel"
    | "semester"
    | "subject"
    | "activityName"
    | "schoolPrompt"
    | "targetChars"
    | "universities",
    string
  >
>;

const slots = (universities: readonly string[]) =>
  Array.from({ length: MAX_UNIVERSITIES }, (_, i) => universities[i] ?? "");

/** 새 세션 폼 초기값. 프로필이 있으면 학년, 학기, 진로를 채우고 없으면 비운다(가짜 기본값 없음). */
export function initialForm(entry: Entry): BasicsForm {
  const p = entry.profile;
  return {
    academicYear: String(entry.academicYearDefault),
    gradeLabel: p?.gradeLabel ?? "",
    semester: p?.semester ? (String(p.semester) as "1" | "2") : "",
    area: "subject",
    subject: "",
    activityName: "",
    schoolPrompt: "",
    teacherNote: "",
    targetChars: String(DEFAULT_TARGET_CHARS),
    targetCharsMode: "with_space",
    career: p?.career ?? "",
    department: p?.department ?? "",
    universities: slots(p?.universities ?? []),
    growthApplied: entry.growth !== null,
    planItemId: null,
  };
}

/** 이미 만든 세션을 다시 열 때(기본 입력 수정) 쓰는 초기값. 서버에 저장된 값을 그대로 옮긴다. */
export function formFromSession(
  session: SessionView,
  entry: Entry,
): BasicsForm {
  const base = initialForm(entry);
  return {
    academicYear:
      session.academicYear === null
        ? base.academicYear
        : String(session.academicYear),
    gradeLabel: session.gradeLabel ?? base.gradeLabel,
    semester: session.semester
      ? (String(session.semester) as "1" | "2")
      : base.semester,
    area: session.area ?? base.area,
    subject: session.subject ?? "",
    activityName: session.activityName ?? "",
    schoolPrompt: session.schoolPrompt ?? "",
    teacherNote: session.teacherNote ?? "",
    targetChars:
      session.targetChars === null ? "" : String(session.targetChars),
    targetCharsMode: session.targetCharsMode,
    career: session.career.career ?? "",
    department: session.career.department ?? "",
    universities: slots(session.career.universities),
    growthApplied: session.growthApplied,
    planItemId: session.planItemId,
  };
}

function parseTargetChars(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= TARGET_CHARS_MIN && n <= TARGET_CHARS_MAX ? n : "invalid";
}

const cleanUniversities = (universities: readonly string[]) =>
  universities.map((u) => u.trim()).filter((u) => u !== "");

/** 필드별 오류 문구. 비어 있는 객체면 통과다. */
export function validateBasics(form: BasicsForm): BasicsErrors {
  const errors: BasicsErrors = {};
  if (!/^\d{4}$/.test(form.academicYear.trim())) {
    errors.academicYear = "학년도를 선택해 주세요.";
  }
  if (form.gradeLabel === "") errors.gradeLabel = "학년을 선택해 주세요.";
  if (form.semester === "") errors.semester = "학기를 선택해 주세요.";
  if (form.area === "subject") {
    if (form.subject.trim() === "") errors.subject = "과목명을 입력해 주세요.";
  } else if (form.activityName.trim() === "") {
    errors.activityName = "활동명을 입력해 주세요.";
  }
  if (form.schoolPrompt.trim() === "") {
    errors.schoolPrompt = "학교에서 받은 문항을 입력해 주세요.";
  }
  if (parseTargetChars(form.targetChars) === "invalid") {
    errors.targetChars = `목표 글자 수는 ${TARGET_CHARS_MIN}자에서 ${TARGET_CHARS_MAX}자 사이 숫자로 입력해 주세요.`;
  }
  const universities = cleanUniversities(form.universities);
  if (new Set(universities).size !== universities.length) {
    errors.universities = "같은 희망 대학이 두 번 들어 있어요.";
  }
  return errors;
}

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** 검증을 통과한 폼을 서버 바디로 바꾼다. 통과하지 못한 폼을 넘기면 안 된다. */
export function buildCreateInput(form: BasicsForm): SessionInput {
  const targetChars = parseTargetChars(form.targetChars);
  return {
    academicYear: Number(form.academicYear),
    gradeLabel: form.gradeLabel as HighGrade,
    semester: Number(form.semester) as 1 | 2,
    area: form.area,
    // 영역에 맞지 않는 쪽은 비워 보낸다(서버도 버리지만 두 값이 함께 가지 않게 한다).
    subject: form.area === "subject" ? orNull(form.subject) : null,
    activityName: form.area === "subject" ? null : orNull(form.activityName),
    schoolPrompt: form.schoolPrompt.trim(),
    teacherNote: orNull(form.teacherNote),
    targetChars: targetChars === "invalid" ? null : targetChars,
    targetCharsMode: form.targetCharsMode,
    career: {
      career: orNull(form.career),
      department: orNull(form.department),
      universities: cleanUniversities(form.universities),
    },
    growthApplied: form.growthApplied,
    planItemId: form.growthApplied ? form.planItemId : null,
  };
}

/** 학생 공용 프로필(student_profiles)에 올릴 값. 다음 진입 때 이 값이 초기값이 된다. */
export type ProfilePayload = {
  grade: HighGrade;
  semester: 1 | 2;
  career: string | null;
  department: string | null;
  universities: string[];
};

export function buildProfilePayload(form: BasicsForm): ProfilePayload {
  return {
    grade: form.gradeLabel as HighGrade,
    semester: Number(form.semester) as 1 | 2,
    career: orNull(form.career),
    department: orNull(form.department),
    universities: cleanUniversities(form.universities),
  };
}

export type SubmitErrorView =
  /** 이미 작성 중인 세션이 있다. 이어서 쓰거나 파기하고 새로 만든다. */
  | { kind: "open"; openSessionId: string | null }
  /** 이용 횟수가 없거나 이용권이 없다. */
  | { kind: "quota" }
  /** 활동을 고른 뒤라 기본 입력을 바꿀 수 없다. */
  | { kind: "locked" }
  /** 세션이 닫혔거나 없다. */
  | { kind: "not_open" }
  | { kind: "message"; message: string };

const TIMEOUT_MESSAGE = "응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.";

/** 세션 생성과 수정 실패를 화면이 고를 분기 하나로 줄인다. */
export function classifySubmitError(
  result: Exclude<ApiResult<unknown>, { kind: "ok" }>,
): SubmitErrorView {
  if (result.kind === "timeout") {
    return { kind: "message", message: TIMEOUT_MESSAGE };
  }
  switch (result.code) {
    case "SESSION_OPEN": {
      const id = result.extra?.openSessionId;
      return {
        kind: "open",
        openSessionId: typeof id === "string" ? id : null,
      };
    }
    case "QUOTA_EXHAUSTED":
    case "NO_ENTITLEMENT":
      return { kind: "quota" };
    case "SESSION_LOCKED":
      return { kind: "locked" };
    case "SESSION_NOT_OPEN":
    case "SESSION_NOT_FOUND":
      return { kind: "not_open" };
    default:
      return { kind: "message", message: result.message };
  }
}
