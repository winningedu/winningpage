import type {
  OpenReport,
  ProfileInitial,
  SurveyEntitlement,
} from "@/lib/growth/api";
import { GROWTH_PATHS } from "../growthPaths";

/** 미완 회차의 이어하기 목적지. */
export function resumeTarget(openReport: OpenReport): string {
  switch (openReport.resume.phase) {
    case "collect":
      return GROWTH_PATHS.collect;
    case "generating":
      return GROWTH_PATHS.generate;
    case "report":
      return GROWTH_PATHS.reports;
    case "plan":
      return GROWTH_PATHS.plan;
    default:
      return GROWTH_PATHS.survey;
  }
}

export type StartMode = "start" | "resume" | "blocked";

/** 주 버튼 상태. 미완 회차가 있으면 이용권과 무관하게 이어하기를 허용한다. */
export function deriveStartMode({
  entitlement,
  openReport,
}: {
  entitlement: SurveyEntitlement;
  openReport: OpenReport | null;
}): StartMode {
  if (openReport) return "resume";
  if (!entitlement.hasAccess || entitlement.quotaRemaining === 0) {
    return "blocked";
  }
  return "start";
}

// ── 학생 정보(student_profiles) ─────────────────────────────────────────

/** student_profiles CHECK 와 같은 값. DB 값은 그대로 두고 표시만 schoolTypeLabel 로 바꾼다. */
export const SCHOOL_TYPES = ["일반고", "특목고", "특목,자사,영재고"] as const;
export const GRADES = ["고1", "고2", "고3", "졸업", "N수"] as const;
export const SEMESTERS = [1, 2] as const;
export const MIN_ADMISSION_YEAR = 2015;
export const MAX_UNIVERSITIES = 2;

type SchoolType = (typeof SCHOOL_TYPES)[number];
type Grade = (typeof GRADES)[number];

/** 쉼표 뒤 공백을 넣어 읽기 쉽게 보여 준다. */
export function schoolTypeLabel(schoolType: string): string {
  return schoolType.replaceAll(",", ", ");
}

export type ProfileValues = {
  schoolType: SchoolType | null;
  admissionYear: number | null;
  grade: Grade | null;
  semester: 1 | 2 | null;
  career: string | null;
  department: string | null;
  universities: string[];
};

function pickText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function pickOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return allowed.find((item) => item === value) ?? null;
}

function pickTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(pickText)
    .filter((v): v is string => v !== null)
    .slice(0, MAX_UNIVERSITIES);
}

/**
 * student_profiles 행 값을 우선하고, 비어 있는 칸만 목표관리 초기값(profileInitial)으로 채운다(명세 No.19).
 * 초기값을 하나라도 썼으면 usedInitial 이 true 다(안내 한 줄을 보여 준다).
 */
export function pickProfileValues(
  profile: Record<string, unknown> | null,
  initial: ProfileInitial | null,
): { values: ProfileValues; usedInitial: boolean } {
  let usedInitial = false;
  const fill = <T>(own: T | null, fromInitial: T | null): T | null => {
    if (own !== null) return own;
    if (fromInitial !== null) usedInitial = true;
    return fromInitial;
  };

  const ownUniversities = pickTexts(profile?.universities);
  const initialUniversities = pickTexts(initial?.universities);
  let universities = ownUniversities;
  if (ownUniversities.length === 0 && initialUniversities.length > 0) {
    universities = initialUniversities;
    usedInitial = true;
  }

  const semester = profile?.semester;
  return {
    values: {
      schoolType: fill(
        pickOneOf(profile?.school_type, SCHOOL_TYPES),
        pickOneOf(initial?.schoolType, SCHOOL_TYPES),
      ),
      admissionYear:
        typeof profile?.admission_year === "number"
          ? profile.admission_year
          : null,
      grade: fill(
        pickOneOf(profile?.grade, GRADES),
        pickOneOf(initial?.grade, GRADES),
      ),
      semester: semester === 1 || semester === 2 ? semester : null,
      career: pickText(profile?.career),
      department: fill(
        pickText(profile?.department),
        pickText(initial?.department),
      ),
      universities,
    },
    usedInitial,
  };
}

/** 필수 4칸 중 하나라도 비면 요약 대신 입력 폼으로 시작한다(시안 643:1002). */
export function needsProfileForm(values: ProfileValues): boolean {
  return (
    values.schoolType === null ||
    values.admissionYear === null ||
    values.grade === null ||
    values.semester === null
  );
}

export type ProfileFormState = {
  schoolType: string;
  admissionYear: string;
  grade: string;
  semester: string;
  career: string;
  department: string;
  universities: string[];
};

export function toFormState(values: ProfileValues): ProfileFormState {
  return {
    schoolType: values.schoolType ?? "",
    admissionYear:
      values.admissionYear === null ? "" : String(values.admissionYear),
    grade: values.grade ?? "",
    semester: values.semester === null ? "" : String(values.semester),
    career: values.career ?? "",
    department: values.department ?? "",
    universities: Array.from(
      { length: MAX_UNIVERSITIES },
      (_, i) => values.universities[i] ?? "",
    ),
  };
}

export type ProfileSavePayload = {
  school_type: SchoolType;
  admission_year: number;
  grade: Grade;
  semester: 1 | 2;
  career: string | null;
  department: string | null;
  universities: string[];
};

export type ProfileValidation =
  | { ok: true; value: ProfileSavePayload }
  | { ok: false; reason: string };

/** currentYear 는 호출부가 넘긴다(테스트에서 시계를 고정하기 위해). */
export function validateProfileForm(
  form: ProfileFormState,
  currentYear: number,
): ProfileValidation {
  const schoolType = pickOneOf(form.schoolType, SCHOOL_TYPES);
  if (!schoolType) return { ok: false, reason: "학교 유형을 선택해 주세요." };

  if (!/^\d{4}$/.test(form.admissionYear.trim())) {
    return { ok: false, reason: "입학 연도는 숫자 4자리로 적어 주세요." };
  }
  const admissionYear = Number(form.admissionYear.trim());
  if (admissionYear < MIN_ADMISSION_YEAR || admissionYear > currentYear + 1) {
    return {
      ok: false,
      reason: `입학 연도는 ${MIN_ADMISSION_YEAR}년부터 ${currentYear + 1}년까지 적을 수 있어요.`,
    };
  }

  const grade = pickOneOf(form.grade, GRADES);
  if (!grade) return { ok: false, reason: "현재 학년을 선택해 주세요." };

  const semester = SEMESTERS.find((s) => String(s) === form.semester);
  if (!semester) return { ok: false, reason: "학기를 선택해 주세요." };

  const universities = form.universities
    .map((u) => u.trim())
    .filter((u) => u !== "");
  if (universities.length > MAX_UNIVERSITIES) {
    return {
      ok: false,
      reason: `희망 대학은 최대 ${MAX_UNIVERSITIES}곳까지 적을 수 있어요.`,
    };
  }
  if (new Set(universities).size !== universities.length) {
    return { ok: false, reason: "같은 희망 대학이 두 번 들어 있어요." };
  }

  return {
    ok: true,
    value: {
      school_type: schoolType,
      admission_year: admissionYear,
      grade,
      semester,
      career: pickText(form.career),
      department: pickText(form.department),
      universities,
    },
  };
}

// ── 표시 문구 ──────────────────────────────────────────────────────────

/** 학생 카드 둘째 줄. 값 없는 조각은 뺀다. 학교명은 student_profiles 에 컬럼이 없어 다루지 않는다. */
export function studentSummaryLine(values: ProfileValues): string | null {
  const grade = values.grade
    ? values.semester !== null && values.grade.startsWith("고")
      ? `${values.grade} ${values.semester}학기`
      : values.grade
    : null;
  const goal = values.department ?? values.career;
  const parts = [grade, goal ? `${goal} 희망` : null].filter(
    (p): p is string => p !== null,
  );
  return parts.length === 0 ? null : parts.join(", ");
}

function parseDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const two = (n: number) => String(n).padStart(2, "0");

/** "2026년 11월 2일". 해석할 수 없으면 null. */
export function formatStartedDate(iso: string): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "2026.11.05 21:40". 해석할 수 없으면 null. */
export function formatSavedAt(iso: string): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function progressPercent(answered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((answered / total) * 100)));
}
