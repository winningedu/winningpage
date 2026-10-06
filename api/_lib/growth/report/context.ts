// 리포트 생성 8단계가 공통으로 쓰는 ReportContext 를 DB 조회 행에서 조립한다(순수 함수).
// DB, fetch, 현재 시각 조회는 하지 않는다. 시각은 인자(nowIso)로 받는다.

import {
  type ActivityRow,
  countByGroup,
  filterMaterialActivities,
} from "../intake/collectSummary.js";
import { expectedSectionIds } from "../sections.js";
import { careerChanged } from "../session.js";
import { analysisRange, omittedSections } from "../tracks.js";
import type { HighGrade, Track } from "../types.js";
import type {
  ContextActivity,
  ContextGradeSemester,
  ContextUniversity,
  ReportContext,
} from "./types.js";

/** activity_records 행 중 컨텍스트에 필요한 열(activity_records 마이그레이션 컬럼명 그대로). */
export type ActivityRecordRow = ActivityRow & {
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
};

/** 모델에 보여줄 활동 본문 상한(글자 수). */
export const ACTIVITY_TEXT_MAX = 4000;

const TEXT_FIELDS: readonly [
  keyof Pick<
    ActivityRecordRow,
    "topic" | "concept" | "method" | "result" | "limitation"
  >,
  string,
][] = [
  ["topic", "주제"],
  ["concept", "개념"],
  ["method", "방법"],
  ["result", "결과"],
  ["limitation", "한계"],
];

/** 본문 필드를 "라벨: 값" 줄로 잇는다. 빈 필드는 건너뛰고 ACTIVITY_TEXT_MAX 에서 자른다. */
export function activityText(row: ActivityRecordRow): string {
  const lines: string[] = [];
  for (const [key, label] of TEXT_FIELDS) {
    const value = row[key]?.trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines.join("\n").slice(0, ACTIVITY_TEXT_MAX);
}

function groupOf(row: ActivityRecordRow): ContextActivity["group"] {
  // 분류 규칙은 collectSummary 의 countByGroup 한 곳만 따른다.
  const counts = countByGroup([row]);
  if (counts.curricular > 0) return "curricular";
  if (counts.extracurricular > 0) return "extracurricular";
  return "unclassified";
}

/** activity_records 행을 ContextActivity 로 평탄화한다. */
export function toContextActivity(row: ActivityRecordRow): ContextActivity {
  return {
    id: row.id,
    sourceProgram: row.source_program,
    gradeLabel: row.grade_label,
    semester: row.semester,
    subjectGroup: row.subject_group,
    subject: row.subject,
    topic: row.topic,
    text: activityText(row),
    group: groupOf(row),
  };
}

/** student_profiles 행 중 컨텍스트에 필요한 열(student_profiles 마이그레이션 컬럼명 그대로). */
export type StudentProfileRow = {
  school_type: string | null;
  admission_year: number | null;
  grade: "고1" | "고2" | "고3" | "졸업" | "N수" | null;
  semester: 1 | 2 | null;
  career: string | null;
  department: string | null;
  universities: string[];
};

/** 설문 문항 key. 학과(q10)와 희망 대학(q11)은 survey.ts 의 SURVEY_QUESTIONS 정의를 따른다. */
const SURVEY_DEPARTMENT_KEY = "q10";
const SURVEY_UNIVERSITIES_KEY = "q11";
const UNIVERSITY_TARGET_MAX = 2;

/** 설문 답은 문자열이거나 { name } 선택지다. 이름이 비면 null. */
function pickName(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "object" && value !== null && "name" in value
        ? (value as { name: unknown }).name
        : null;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name === "" ? null : name;
}

/**
 * 입결 조회 대상. 대학은 프로필 희망 대학이 우선이고 비어 있으면 설문 q11 을 쓴다.
 * 학과는 한 개뿐이라 대학마다 같은 학과를 붙인다(가정). 프로필 학과가 없으면 설문 q10.
 * 중복을 없애고 최대 2개.
 */
export function universityTargets(
  survey: Record<string, unknown>,
  profile: Pick<StudentProfileRow, "department" | "universities"> | null,
): { universityName: string; departmentName: string | null }[] {
  const fromProfile = (profile?.universities ?? [])
    .map(pickName)
    .filter((n): n is string => n !== null);
  const surveyValue = survey[SURVEY_UNIVERSITIES_KEY];
  const fromSurvey = (Array.isArray(surveyValue) ? surveyValue : [])
    .map(pickName)
    .filter((n): n is string => n !== null);
  const names = [...new Set(fromProfile.length > 0 ? fromProfile : fromSurvey)];
  const departmentName =
    pickName(profile?.department) ?? pickName(survey[SURVEY_DEPARTMENT_KEY]);
  return names.slice(0, UNIVERSITY_TARGET_MAX).map((universityName) => ({
    universityName,
    departmentName,
  }));
}

/** admission_results 행 중 컨텍스트에 필요한 열(생성 타입의 Row 컬럼명 그대로). */
export type AdmissionRow = {
  university_name: string;
  department_name: string;
  result_year: number;
  main_track: string | null;
  grade_avg: number | null;
};

export type UniversityCuts = {
  universityName: string;
  departmentName: string;
  cuts: { year: number; grade: number | null }[];
};

const CUT_YEARS = 2;
const COMPREHENSIVE_TRACK = "종합";

/**
 * 같은 연도 여러 전형 중 하나를 고르는 가정: 학생부종합 계열(main_track 에 "종합" 포함)의
 * 등급이 있으면 그중 최소 grade_avg(숫자가 작을수록 좋은 성적), 없으면 전체 전형 중 최소 grade_avg.
 * 등급 값이 하나도 없으면 null 로 남긴다(지어내지 않음). 평균은 내지 않는다.
 */
function pickYearGrade(rows: readonly AdmissionRow[]): number | null {
  const graded = rows.filter(
    (r): r is AdmissionRow & { grade_avg: number } => r.grade_avg !== null,
  );
  const comprehensive = graded.filter((r) =>
    r.main_track?.includes(COMPREHENSIVE_TRACK),
  );
  const pool = comprehensive.length > 0 ? comprehensive : graded;
  return pool.length === 0 ? null : Math.min(...pool.map((r) => r.grade_avg));
}

/** 입결 행을 대학, 학과별 최근 2개년({year, grade}, 오래된 연도부터)으로 접는다. */
export function cutsFromAdmissionRows(
  rows: readonly AdmissionRow[],
): UniversityCuts[] {
  const groups = new Map<string, AdmissionRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.university_name, row.department_name]);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map((group) => {
    const years = [...new Set(group.map((r) => r.result_year))]
      .sort((a, b) => b - a)
      .slice(0, CUT_YEARS)
      .sort((a, b) => a - b);
    const first = group[0] as AdmissionRow;
    return {
      universityName: first.university_name,
      departmentName: first.department_name,
      cuts: years.map((year) => ({
        year,
        grade: pickYearGrade(group.filter((r) => r.result_year === year)),
      })),
    };
  });
}

/** growth_reports 행 중 컨텍스트에 필요한 열. */
export type ReportRow = {
  id: string;
  profile_id: string;
  track: Track | null;
  survey_answers: unknown;
  activity_ids: string[];
  /** P3 commit 이 저장한 buildGradeInputs 출력({system, semesters, note}). */
  grade_inputs: unknown;
  created_at: string;
};

export type PreviousReportRow = {
  narrative_theme: unknown;
  issued_at: string;
  survey_answers: unknown;
};

export type BuildReportContextInput = {
  report: ReportRow;
  activities: readonly ActivityRecordRow[];
  profile: StudentProfileRow | null;
  admissionRows: readonly AdmissionRow[];
  previousReport: PreviousReportRow | null;
  nowIso: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const CURRENT_GRADE: Record<Track, HighGrade> = {
  고1: "고1",
  고2: "고2",
  고3: "고3",
  졸업: "고3",
  N수: "고3",
};

const HIGH_GRADE_NUMBER: Record<HighGrade, 1 | 2 | 3> = {
  고1: 1,
  고2: 2,
  고3: 3,
};

function isHighGrade(v: unknown): v is HighGrade {
  return v === "고1" || v === "고2" || v === "고3";
}

function universities(
  targets: ReturnType<typeof universityTargets>,
  admissionRows: readonly AdmissionRow[],
): ContextUniversity[] {
  const cuts = cutsFromAdmissionRows(admissionRows);
  return targets.map((t) => ({
    universityName: t.universityName,
    departmentName: t.departmentName,
    cuts:
      cuts.find(
        (c) =>
          c.universityName === t.universityName &&
          c.departmentName === t.departmentName,
      )?.cuts ?? [],
  }));
}

function previousNarrative(
  previous: PreviousReportRow | null,
): ReportContext["previousNarrative"] {
  if (previous === null || typeof previous.narrative_theme !== "string")
    return null;
  return {
    theme: previous.narrative_theme,
    issuedAt: previous.issued_at,
    career: surveyCareer(previous.survey_answers),
  };
}

/** 설문에서 희망 진로를 담은 문항 key(진로와 관심 그룹의 첫 텍스트 문항, 가정). */
export const SURVEY_CAREER_KEY = "q6";

const EMPTY_GRADES: ReportContext["grades"] = {
  system: null,
  semesters: [],
  note: null,
};

function isGradeSemester(v: unknown): v is ContextGradeSemester {
  return (
    isPlainObject(v) &&
    typeof v.key === "string" &&
    (v.average === null || typeof v.average === "number") &&
    (v.source === null || v.source === "direct" || v.source === "goal")
  );
}

/** 저장된 grade_inputs 가 계약 모양이면 그대로, 아니면 빈 구조. */
function parseGradeInputs(v: unknown): ReportContext["grades"] {
  if (
    isPlainObject(v) &&
    (v.system === null || v.system === "five" || v.system === "nine") &&
    Array.isArray(v.semesters) &&
    v.semesters.every(isGradeSemester) &&
    (v.note === null || typeof v.note === "string")
  ) {
    return { system: v.system, semesters: v.semesters, note: v.note };
  }
  return EMPTY_GRADES;
}

function surveyCareer(survey: unknown): string | null {
  return isPlainObject(survey) ? pickName(survey[SURVEY_CAREER_KEY]) : null;
}

/** 회차 행과 조회 결과로 8단계 공통 컨텍스트를 만든다. */
export function buildReportContext(
  input: BuildReportContextInput,
): ReportContext {
  const { report, profile } = input;
  const track = report.track;
  if (track === null) throw new Error("회차에 트랙이 없습니다");

  const byId = new Map(input.activities.map((a) => [a.id, a]));
  const picked = report.activity_ids
    .map((id) => byId.get(id))
    .filter((a): a is ActivityRecordRow => a !== undefined);
  const activities = filterMaterialActivities(picked).map(toContextActivity);

  const survey = isPlainObject(report.survey_answers)
    ? report.survey_answers
    : {};
  const noFirstYearData =
    track !== "고1" && !activities.some((a) => a.gradeLabel === "고1");
  const omitted = omittedSections(track, { noFirstYearData });
  const profileGrade = isHighGrade(profile?.grade) ? profile.grade : null;
  const profileSemester = profile?.semester ?? null;
  const current =
    profileGrade !== null && profileSemester !== null
      ? { grade: HIGH_GRADE_NUMBER[profileGrade], semester: profileSemester }
      : undefined;

  return {
    reportId: report.id,
    profileId: report.profile_id,
    track,
    currentGrade: CURRENT_GRADE[track],
    range: analysisRange(track, current),
    omitted,
    expectedSectionIds: expectedSectionIds({ omit: omitted.ids }),
    noFirstYearData,
    activities,
    evidenceIds: activities.map((a) => a.id),
    survey,
    profile: {
      schoolType: profile?.school_type ?? null,
      grade: profileGrade,
      semester: profileSemester,
      career: profile?.career ?? null,
      admissionYear: profile?.admission_year ?? null,
    },
    grades: parseGradeInputs(report.grade_inputs),
    universities: universities(
      universityTargets(survey, profile),
      input.admissionRows,
    ),
    previousNarrative: previousNarrative(input.previousReport),
    nowIso: input.nowIso,
  };
}

/** 이전 회차 대비 진로 변경 여부. 현재 진로는 프로필이 우선이고 없으면 설문 답. */
export function careerChangedSincePrevious(context: ReportContext): boolean {
  if (context.previousNarrative === null) return false;
  const current = context.profile.career ?? surveyCareer(context.survey);
  return careerChanged(context.previousNarrative.career, current);
}
