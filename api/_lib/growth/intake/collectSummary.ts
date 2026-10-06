// 성장설계 자료 수집 요약(순수 함수). 시안 활동 선택 화면과 명세 No.37~51, No.121 을 따른다.

import { deriveGradeSystem, semesterAverages } from "../gradeSystem.js";
import { semesterSubjectsFromNaesin } from "../prefill.js";
import {
  analysisRange,
  firstYearSufficiency,
  monthlyPlan,
  omittedSections,
  type Sufficiency,
  semesterNotice,
  sufficiency,
  sufficiencyLabel,
} from "../tracks.js";
import type { GradeSystem, SemesterKey, Track } from "../types.js";

export type ActivitySource =
  | "performance"
  | "deep"
  | "self"
  | "manual"
  | "upload";
export type ActivityStatus = "planned" | "draft" | "confirmed" | "final";

/** activity_records 행 중 집계에 필요한 열만 느슨하게 받는다. */
export type ActivityRow = {
  id: string;
  source_program: ActivitySource;
  status: ActivityStatus;
  grade_label: "고1" | "고2" | "고3" | null;
  semester: 1 | 2 | null;
  subject_group: string | null;
  subject: string | null;
};

/** 분석 재료가 되는 활동: planned 만 제외하고 입력 순서를 유지한다(No.121). */
export function filterMaterialActivities<T extends ActivityRow>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => r.status !== "planned");
}

export type SourceCounts = Record<ActivitySource, number> & { total: number };

/** 출처별 건수와 합계(시안 "저장된 활동" 표). */
export function countBySource(rows: readonly ActivityRow[]): SourceCounts {
  const counts: SourceCounts = {
    performance: 0,
    self: 0,
    deep: 0,
    manual: 0,
    upload: 0,
    total: 0,
  };
  for (const r of rows) {
    counts[r.source_program] += 1;
    counts.total += 1;
  }
  return counts;
}

/** 학기별 건수. 학년이나 학기가 비어 있는 행은 unplaced 로 따로 센다. */
export function countBySemester(rows: readonly ActivityRow[]): {
  bySemester: Partial<Record<SemesterKey, number>>;
  unplaced: number;
} {
  const bySemester: Partial<Record<SemesterKey, number>> = {};
  let unplaced = 0;
  for (const r of rows) {
    if (r.grade_label == null || r.semester == null) {
      unplaced += 1;
      continue;
    }
    const key = `${r.grade_label}-${r.semester}` as SemesterKey;
    bySemester[key] = (bySemester[key] ?? 0) + 1;
  }
  return { bySemester, unplaced };
}

/** 창체로 보는 교과군 접두어. 정확히 "창체" 이거나 아래 접두어로 시작하면 창체다. */
export const EXTRACURRICULAR_GROUP_PREFIXES = [
  "창체",
  "자율",
  "동아리",
  "진로",
  "봉사",
] as const;

export function isExtracurricularGroup(group: string | null): boolean {
  if (group == null) return false;
  return EXTRACURRICULAR_GROUP_PREFIXES.some((p) => group.startsWith(p));
}

/** 교과, 창체, 미분류 건수. 교과군이 비어 있는 행(업로드 추출, 직접 입력)은 미분류로 센다. */
export function countByGroup(rows: readonly ActivityRow[]): {
  curricular: number;
  extracurricular: number;
  unclassified: number;
} {
  let curricular = 0;
  let extracurricular = 0;
  let unclassified = 0;
  for (const r of rows) {
    if (r.subject_group == null || r.subject_group === "") unclassified += 1;
    else if (isExtracurricularGroup(r.subject_group)) extracurricular += 1;
    else curricular += 1;
  }
  return { curricular, extracurricular, unclassified };
}

export type SemesterRow = {
  key: SemesterKey;
  count: number;
  sufficiency: Sufficiency;
  label: string;
  notice: string | null;
};

/** 분석 범위 학기마다 건수, 충분도, 안내 문구를 붙인다(No.40, No.44). */
export function semesterRows(
  track: Track,
  bySemester: Partial<Record<SemesterKey, number>>,
  thresholds: { enough: number },
  current?: { grade: 1 | 2 | 3; semester: 1 | 2 },
): SemesterRow[] {
  return analysisRange(track, current).semesters.map((key) => {
    const count = bySemester[key] ?? 0;
    const level = sufficiency(count, thresholds);
    return {
      key,
      count,
      sufficiency: level,
      label: sufficiencyLabel(level),
      notice: semesterNotice(count),
    };
  });
}

export type GradeInputSemester = {
  key: SemesterKey;
  average: number | null;
  source: "direct" | "goal" | null;
};

const NO_GRADE_NOTE = "성적을 입력하지 않아 성적 진단은 자료 없음으로 둡니다";
const NO_SYSTEM_NOTE = "입학 연도가 없어 등급 체계를 정하지 못했습니다";

/**
 * 성적 입력값 정리. 등급 체계는 입학 연도로 정하고(No.73), 학기 값은 직접 입력을 우선,
 * 없으면 목표관리 내신 성적을 접은 평균을 쓴다. 둘 다 없으면 null 로 둔다(No.46, No.82).
 */
export function buildGradeInputs(input: {
  profile: { admission_year: number | null } | null;
  naesinScores: unknown;
  direct: Partial<Record<SemesterKey, number | null>> | null;
}): {
  system: GradeSystem | null;
  semesters: GradeInputSemester[];
  note: string | null;
} {
  const system =
    input.profile === null
      ? null
      : deriveGradeSystem(input.profile.admission_year);
  const folded = new Map(
    semesterAverages(
      semesterSubjectsFromNaesin(input.naesinScores).semesters.map((s) => ({
        key: s.key,
        subjects: s.subjects,
      })),
    ).map((s) => [s.key, s.average]),
  );
  const keys = new Set<SemesterKey>([
    ...folded.keys(),
    ...(Object.keys(input.direct ?? {}) as SemesterKey[]),
  ]);
  const semesters = [...keys].sort().map((key): GradeInputSemester => {
    const direct = input.direct?.[key] ?? null;
    if (direct !== null) return { key, average: direct, source: "direct" };
    const goal = folded.get(key) ?? null;
    if (goal !== null) return { key, average: goal, source: "goal" };
    return { key, average: null, source: null };
  });
  const noteParts: string[] = [];
  if (system === null) noteParts.push(NO_SYSTEM_NOTE);
  if (semesters.every((s) => s.average === null)) noteParts.push(NO_GRADE_NOTE);
  return {
    system,
    semesters,
    note: noteParts.length > 0 ? noteParts.join(". ") : null,
  };
}

/** 학기당 업로드 상한(No.42, 명세 고정값). */
export const UPLOAD_LIMIT_PER_SEMESTER = 10;

export type UploadStatus = "pending" | "processing" | "ok" | "failed";

export type UploadRow = {
  id: string;
  grade_label: "고1" | "고2" | "고3" | null;
  semester: 1 | 2 | null;
  extraction_status: UploadStatus;
};

/** 파일 목록 표시용으로 파일명까지 받는 업로드 행. */
export type CollectUploadRow = UploadRow & { file_name: string };

/** 학기에 더 올릴 수 있는 건수. 추출 실패(failed)는 상한에서 세지 않는다. */
export function uploadQuotaLeft(
  uploads: readonly UploadRow[],
  gradeLabel: "고1" | "고2" | "고3",
  semester: 1 | 2,
  limit: number = UPLOAD_LIMIT_PER_SEMESTER,
): number {
  const used = uploads.filter(
    (u) =>
      u.grade_label === gradeLabel &&
      u.semester === semester &&
      u.extraction_status !== "failed",
  ).length;
  return Math.max(0, limit - used);
}

export type CollectSummaryInput = {
  track: Track;
  current?: { grade: 1 | 2 | 3; semester: 1 | 2 } | undefined;
  rows: readonly ActivityRow[];
  thresholds: { enough: number };
  profile: { admission_year: number | null } | null;
  naesinScores: unknown;
  directGrades: Partial<Record<SemesterKey, number | null>> | null;
  uploads: readonly CollectUploadRow[];
};

/** "고1-2" 를 "1학년 2학기" 로 바꾼다. */
function semesterText(key: SemesterKey): string {
  return `${key[1]}학년 ${key[3]}학기`;
}

/** 시작 화면과 활동 선택 화면이 쓰는 요약을 한 번에 만든다(No.37~51, No.133). */
export function buildCollectSummary(input: CollectSummaryInput) {
  const material = filterMaterialActivities(input.rows);
  const bySource = countBySource(material);
  const { bySemester } = countBySemester(material);
  const firstYear = firstYearSufficiency(bySemester, input.thresholds);
  const semesters = semesterRows(
    input.track,
    bySemester,
    input.thresholds,
    input.current,
  );

  const warnings: string[] = [];
  const lacking = semesters.filter((r) => r.sufficiency !== "enough");
  if (lacking.length > 0) {
    warnings.push(
      `${lacking.map((r) => semesterText(r.key)).join(", ")} 자료가 부족해요. 올리지 않아도 진행할 수 있어요.`,
    );
  }
  if (input.track === "고3") {
    warnings.push("3학년은 기록이 수시 시기에 일찍 마감돼요.");
  }
  if (bySource.total === 0) {
    warnings.push(
      "저장된 활동이 없어요. 직접 입력하거나 파일을 올리거나 그대로 리포트를 만들 수 있어요.",
    );
  }

  return {
    range: analysisRange(input.track, input.current),
    omitted: omittedSections(input.track, {
      noFirstYearData: firstYear.count === 0,
    }),
    bySource,
    byGroup: countByGroup(material),
    semesters,
    firstYear,
    // 추출이 끝나지 않은 업로드: 대기와 처리 중을 모두 센다.
    uploadsPending: input.uploads.filter(
      (u) =>
        u.extraction_status === "pending" ||
        u.extraction_status === "processing",
    ).length,
    uploads: input.uploads.map((u) => ({
      id: u.id,
      fileName: u.file_name,
      gradeLabel: u.grade_label,
      semester: u.semester,
      status: u.extraction_status,
    })),
    uploadQuotaBySemester: Object.fromEntries(
      semesters.map((r) => [
        r.key,
        uploadQuotaLeft(
          input.uploads,
          `고${r.key[1]}` as "고1" | "고2" | "고3",
          Number(r.key[3]) as 1 | 2,
        ),
      ]),
    ) as Partial<Record<SemesterKey, number>>,
    analysisActivityIds: material.map((r) => r.id),
    gradeInputs: buildGradeInputs({
      profile: input.profile,
      naesinScores: input.naesinScores,
      direct: input.directGrades,
    }),
    monthlyPlan: monthlyPlan(input.track),
    warnings,
  };
}
