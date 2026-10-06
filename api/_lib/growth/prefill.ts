// 성장설계 초기값 채우기(prefill). 다른 서비스 데이터에서 설문, 프로필 초기값을 만든다.
// 순수 함수. 값이 없으면 undefined 로 비워 둔다(임의 기본값 금지).

import type { HighGrade, SemesterKey } from "./types.js";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 진단 goal.level 코드(Q3_LEVEL) → q5 진로 확정 정도(No.34). 대응 없는 코드는 비운다.
 * 이 매핑표는 명세 근거 없음, 고객사 확인 대상(No.33, No.34).
 */
const Q5_BY_LEVEL: Record<string, string> = {
  BOTH: "정해짐",
  UNIV_ONLY: "고민 중",
  MAJOR_ONLY: "고민 중",
  TIER_ONLY: "고민 중",
  UNDECIDED_MULTI: "탐색 중",
  NONE: "탐색 중",
};

/**
 * 진단 schedule 코드(SCHEDULE) → q24 주당 가능 시간(No.34).
 * 진단의 schedule 은 '임박 일정'(PA_7D, EXAM_2W, MONTH_1, SUSI, NONE, UNKNOWN)이라 주당 시간과
 * 대응하는 코드가 없다. 지어내지 않으므로 의도적으로 비어 있다. 명세가 대응표를 확정하면 여기만 채운다.
 */
const Q24_BY_SCHEDULE: Record<string, string> = {};

const nonEmptyText = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
};

export type SurveyPrefill = Partial<
  Record<"q5" | "q10" | "q11" | "q24", unknown>
> & { filledFrom: "diagnosis" };

/** 무료진단 snapshot → 성장설계 설문 초기값(No.34). */
export function prefillSurveyFromDiagnosis(snapshot: unknown): SurveyPrefill {
  const result: SurveyPrefill = { filledFrom: "diagnosis" };
  if (!isRec(snapshot)) return result;
  const goal = isRec(snapshot.goal) ? snapshot.goal : {};
  if (
    typeof goal.level === "string" &&
    Object.hasOwn(Q5_BY_LEVEL, goal.level)
  ) {
    result.q5 = Q5_BY_LEVEL[goal.level];
  }
  const major = nonEmptyText(goal.targetMajor);
  if (major) result.q10 = { name: major, source: "diagnosis" };
  const univ = nonEmptyText(goal.targetUniversity);
  if (univ) result.q11 = [{ name: univ, source: "diagnosis" }];
  if (
    typeof snapshot.schedule === "string" &&
    Object.hasOwn(Q24_BY_SCHEDULE, snapshot.schedule)
  ) {
    result.q24 = Q24_BY_SCHEDULE[snapshot.schedule];
  }
  return result;
}

export type GoalStudentProfile = {
  career?: undefined;
  department?: string;
  universities?: string[];
  grade?: HighGrade;
  schoolType?: string;
  source: "goal";
};

const GRADES = ["고1", "고2", "고3"] as const;

/** goal_students 행 → 성장설계 학생 프로필 초기값(No.19, 20). 진로는 목표관리에 없어 채우지 않는다. */
export function initialStudentProfileFromGoal(
  goalStudent: unknown,
): GoalStudentProfile {
  const result: GoalStudentProfile = { source: "goal" };
  if (!isRec(goalStudent)) return result;
  const department =
    nonEmptyText(goalStudent.ideal_department) ??
    nonEmptyText(goalStudent.min_department);
  if (department) result.department = department;
  const universities = [
    ...new Set(
      [goalStudent.ideal_university, goalStudent.min_university]
        .map(nonEmptyText)
        .filter((v): v is string => v !== undefined),
    ),
  ].slice(0, 2);
  if (universities.length > 0) result.universities = universities;
  const grade = GRADES.find((g) => g === goalStudent.grade);
  if (grade) result.grade = grade;
  const schoolType = nonEmptyText(goalStudent.school_type);
  if (schoolType) result.schoolType = schoolType;
  return result;
}

export type NaesinSemesterSubjects = {
  key: SemesterKey;
  examLabel: string;
  subjects: { name: string; grade: number }[];
};

/** exam.key → "고N-M". 학년(1~3)과 학기(1~2)를 못 찾거나 "중" 접두 키면 undefined. */
const SEMESTER_PATTERN =
  /(?<!중\s*)(?:고\s*)?([1-3])\s*(?:학년|-|\s)\s*([12])(?:\s*학기)?/;

function normalizeSemesterKey(key: string): SemesterKey | undefined {
  const m = SEMESTER_PATTERN.exec(key);
  return m ? (`고${m[1]}-${m[2]}` as SemesterKey) : undefined;
}

function flattenSubjects(exam: Rec): { name: string; grade: number }[] {
  const out: { name: string; grade: number }[] = [];
  if (!isRec(exam.groups)) return out;
  for (const group of Object.values(exam.groups)) {
    if (!isRec(group) || !Array.isArray(group.subjects)) continue;
    for (const subject of group.subjects) {
      if (!isRec(subject) || typeof subject.name !== "string") continue;
      if (typeof subject.grade !== "number" || !Number.isFinite(subject.grade))
        continue;
      out.push({ name: subject.name, grade: subject.grade });
    }
  }
  return out;
}

/**
 * goal_students.naesin_scores 의 naesinExams 를 학기 단위로 접는다(No.19).
 * 같은 학기 시험이 여럿이면 기말 우선, 없으면 배열 뒤쪽 시험의 과목만 쓴다.
 */
export function semesterSubjectsFromNaesin(naesinScores: unknown): {
  semesters: NaesinSemesterSubjects[];
  skipped: string[];
} {
  const exams = Array.isArray(naesinScores)
    ? naesinScores
    : isRec(naesinScores) && Array.isArray(naesinScores.naesinExams)
      ? naesinScores.naesinExams
      : [];
  const skipped: string[] = [];
  const chosen = new Map<
    SemesterKey,
    { exam: Rec; key: string; final: boolean }
  >();
  for (const exam of exams) {
    if (!isRec(exam) || typeof exam.key !== "string") continue;
    const semester = normalizeSemesterKey(exam.key);
    if (!semester) {
      skipped.push(exam.key);
      continue;
    }
    const final = exam.key.includes("기말");
    const prev = chosen.get(semester);
    // 기말은 이전 선택이 기말이 아닐 때만 대체 우선, 둘 다 같은 등급이면 뒤쪽이 이긴다.
    if (!prev || final || !prev.final) {
      chosen.set(semester, { exam, key: exam.key, final });
    }
  }
  const semesters = [...chosen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      key,
      examLabel: v.key,
      subjects: flattenSubjects(v.exam),
    }));
  return { semesters, skipped };
}

/** 선호 과목으로 인정하는 최소 활동 건수(No.33). 명세 근거 없음, 고객사 확인 대상(No.33, No.34). */
const FAVORITE_MIN_ACTIVITIES = 2;

const looksLikeBookText = (t: string): boolean =>
  t.includes("『") ||
  t.includes("』") ||
  t.includes("「") ||
  t.includes("」") ||
  t.includes("(저");

function bookNameFrom(source: unknown): string | undefined {
  if (typeof source === "string") {
    const t = source.trim();
    return t && looksLikeBookText(t) ? t : undefined;
  }
  if (isRec(source) && source.type === "book") {
    return nonEmptyText(source.title) ?? nonEmptyText(source.name);
  }
  return undefined;
}

/** 활동 기록에서 선호 과목과 읽은 책을 자동 추출한다(No.33, 143). 근거 없는 값은 만들지 않는다. */
export function autoFilledFromActivities(
  activities: { subject?: string | null; sources?: unknown }[],
): { favoriteSubjects: string[]; books: string[] } {
  const counts = new Map<string, number>();
  const books = new Set<string>();
  for (const activity of activities) {
    const subject = nonEmptyText(activity.subject);
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1);
    if (Array.isArray(activity.sources)) {
      for (const source of activity.sources) {
        const book = bookNameFrom(source);
        if (book) books.add(book);
      }
    }
  }
  // Array.prototype.sort 는 안정 정렬이라 동률은 처음 나온 순서를 유지한다.
  const favoriteSubjects = [...counts.entries()]
    .filter(([, n]) => n >= FAVORITE_MIN_ACTIVITIES)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  return { favoriteSubjects, books: [...books] };
}
