// 활동 선택 화면(명세 No.37~51, 73, 75, 113, 120~122, 145, 153, 154)의 순수 규칙.
// 화면은 이 모듈이 돌려준 값만 그린다. 서버 계약은 src/lib/growth/types.ts 와 api/growth/collect.ts 를 따른다.
import type {
  ApiResult,
  CollectSummary,
  CurrentSemester,
  GradeInputSemester,
  GradeSystem,
  SemesterKey,
  SourceCounts,
  Track,
} from "@/lib/growth/api";

export const TRACKS: readonly Track[] = ["고1", "고2", "고3", "졸업", "N수"];

/** 프로필 학년이 트랙 5종 중 하나면 그 값, 아니면 null(선택을 요구한다). */
export function initialTrack(profileGrade: string | null): Track | null {
  return TRACKS.find((t) => t === profileGrade) ?? null;
}

const TRACK_GRADE: Record<Track, 1 | 2 | 3> = {
  고1: 1,
  고2: 2,
  고3: 3,
  졸업: 3,
  N수: 3,
};

/** 고1~고3 은 트랙 학년과 프로필 학기를 current 로 쓴다. 졸업, N수, 학기 미상은 보내지 않는다. */
export function currentFor(
  track: Track,
  profileSemester: 1 | 2 | null,
): CurrentSemester | undefined {
  if (track === "졸업" || track === "N수" || profileSemester === null) {
    return undefined;
  }
  return { grade: TRACK_GRADE[track], semester: profileSemester };
}

const TRACK_JOSA: Record<Track, "을" | "를"> = {
  고1: "을",
  고2: "를",
  고3: "을",
  졸업: "을",
  N수: "를",
};

/** 시안 "고2를 골랐어요. ..." 문구. 뒤 설명은 서버 분석 범위 설명을 그대로 쓴다. */
export function trackChoiceNotice(track: Track, description: string): string {
  return `${track}${TRACK_JOSA[track]} 골랐어요. ${description}`;
}

// ── 학기별 기록 ───────────────────────────────────────────────────────

const ALL_SEMESTERS: readonly SemesterKey[] = [
  "고1-1",
  "고1-2",
  "고2-1",
  "고2-2",
  "고3-1",
  "고3-2",
];

export type SemesterBadge = { tone: "ok" | "warn" | "none"; text: string };

export type SemesterItem = {
  key: SemesterKey;
  /** "1학년 2학기". */
  title: string;
  count: number;
  /** 서버 분석 범위 안 학기. 밖이면 화면이 흐리게 그린다. */
  inRange: boolean;
  badge: SemesterBadge | null;
  /** 자료가 충분하지 않아 "N학년 N학기 자료 추가" 영역을 보여 줄 학기. */
  recommendUpload: boolean;
  /** 이 학기에 더 올릴 수 있는 파일 수. 서버가 주지 않았으면 null. */
  uploadsLeft: number | null;
};

/** "고2-1" 에서 학년(2). */
export function gradeOfKey(key: SemesterKey): 1 | 2 | 3 {
  return Number(key[1]) as 1 | 2 | 3;
}

/** "고2-1" 에서 학기(1). */
export function semesterOfKey(key: SemesterKey): 1 | 2 {
  return Number(key[3]) as 1 | 2;
}

export function semesterTitle(key: SemesterKey): string {
  return `${gradeOfKey(key)}학년 ${semesterOfKey(key)}학기`;
}

/** 서버 학기 행에 트랙 학년까지의 범위 밖 학기를 흐린 행으로 덧붙인다. */
export function buildSemesterItems(
  track: Track,
  summary: CollectSummary,
): SemesterItem[] {
  const maxGrade = TRACK_GRADE[track];
  const rows = new Map(summary.semesters.map((r) => [r.key, r]));
  return ALL_SEMESTERS.filter((key) => gradeOfKey(key) <= maxGrade).map(
    (key): SemesterItem => {
      const row = rows.get(key);
      const base = {
        key,
        title: semesterTitle(key),
        uploadsLeft: summary.uploadQuotaBySemester[key] ?? null,
      };
      if (!row) {
        return {
          ...base,
          count: 0,
          inRange: false,
          badge: null,
          recommendUpload: false,
        };
      }
      const badge: SemesterBadge =
        row.sufficiency === "enough"
          ? { tone: "ok", text: "자료 있음" }
          : row.sufficiency === "insufficient"
            ? { tone: "warn", text: "자료 부족" }
            : { tone: "none", text: row.notice ?? row.label };
      return {
        ...base,
        count: row.count,
        inRange: true,
        badge,
        recommendUpload: row.sufficiency !== "enough",
      };
    },
  );
}

// ── 성적 ──────────────────────────────────────────────────────────────

/** 등급 체계는 앱이 입학 연도로 정한다(No.120). 체계를 모르면 안내만 하고 입력을 받지 않는다. */
export const NO_SYSTEM_NOTICE = "입학 연도를 입력하면 등급 체계가 정해져요";

const GRADE_MAX: Record<GradeSystem, 5 | 9> = { five: 5, nine: 9 };

export type GradeValidation =
  | { status: "empty" }
  | { status: "ok"; value: number }
  | { status: "error"; message: string };

/** 평균 등급 입력 한 칸 검증(No.75): 체계별 1~5 또는 1~9, 소수 첫째 자리까지. */
export function validateGradeInput(
  text: string,
  system: GradeSystem | null,
): GradeValidation {
  if (system === null) return { status: "error", message: NO_SYSTEM_NOTICE };
  const trimmed = text.trim();
  if (trimmed === "") return { status: "empty" };
  const max = GRADE_MAX[system];
  const range = `1부터 ${max}까지 적어 주세요.`;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { status: "error", message: range };
  }
  if (/\.\d{2,}$/.test(trimmed)) {
    return {
      status: "error",
      message: "소수 첫째 자리까지만 적을 수 있어요.",
    };
  }
  const value = Number(trimmed);
  if (value < 1 || value > max) return { status: "error", message: range };
  return { status: "ok", value };
}

/** 입력 칸 전체를 summary, commit 에 보낼 directGrades 와 칸별 오류로 나눈다. 빈 칸은 보내지 않는다. */
export function buildDirectGrades(
  texts: Partial<Record<SemesterKey, string>>,
  system: GradeSystem | null,
): {
  directGrades: Partial<Record<SemesterKey, number>>;
  errors: Partial<Record<SemesterKey, string>>;
} {
  const directGrades: Partial<Record<SemesterKey, number>> = {};
  const errors: Partial<Record<SemesterKey, string>> = {};
  for (const key of Object.keys(texts) as SemesterKey[]) {
    const result = validateGradeInput(texts[key] ?? "", system);
    if (result.status === "ok") directGrades[key] = result.value;
    else if (result.status === "error") errors[key] = result.message;
  }
  return { directGrades, errors };
}

/** 성적 칸에 보일 문자열. 사용자가 고친 칸(빈 문자열 포함)은 그대로, 나머지는 서버 평균. */
export function buildGradeDisplay(
  gradeTexts: Partial<Record<SemesterKey, string>>,
  gradeKeys: readonly SemesterKey[],
  serverSemesters: readonly GradeInputSemester[],
): Partial<Record<SemesterKey, string>> {
  const values: Partial<Record<SemesterKey, string>> = {};
  for (const key of gradeKeys) {
    values[key] =
      gradeTexts[key] ??
      averageToText(
        serverSemesters.find((s) => s.key === key)?.average ?? null,
      );
  }
  return values;
}

const NINE_NOTICE =
  "입학 연도가 2024학년도 이전이라 9등급제로 계산해요. 1부터 9까지 적어 주세요.";

/** 등급 체계 라벨, "2025학년도 입학" 근거 배지, 9등급제 안내(시안 646:3566). */
export function gradeSystemInfo(
  system: GradeSystem | null,
  admissionYear: number | null,
): { label: string | null; basis: string | null; notice: string | null } {
  if (system === null) {
    return { label: null, basis: null, notice: NO_SYSTEM_NOTICE };
  }
  return {
    label: system === "five" ? "5등급제" : "9등급제",
    basis: admissionYear === null ? null : `${admissionYear}학년도 입학`,
    notice: system === "nine" ? NINE_NOTICE : null,
  };
}

/** 서버가 준 평균을 입력 칸 초기 문자열로 바꾼다(소수 첫째 자리). */
export function averageToText(average: number | null): string {
  return average === null ? "" : String(Math.round(average * 10) / 10);
}

// ── 리포트 만들기 ─────────────────────────────────────────────────────

export type CreateBlockReason =
  | "no-report"
  | "loading"
  | "uploading"
  | "pending-uploads"
  | "invalid-grades"
  | "committing";

/** "리포트 만들기" 를 막는 첫 사유. 없으면 null. 서버도 UPLOADS_PENDING 으로 한 번 더 막는다. */
export function createBlockReason(input: {
  hasOpenReport: boolean;
  summaryLoaded: boolean;
  uploadsPending: number;
  uploadBusy: boolean;
  hasGradeErrors: boolean;
  committing: boolean;
}): CreateBlockReason | null {
  if (!input.hasOpenReport) return "no-report";
  if (input.committing) return "committing";
  if (!input.summaryLoaded) return "loading";
  if (input.uploadBusy) return "uploading";
  if (input.uploadsPending > 0) return "pending-uploads";
  if (input.hasGradeErrors) return "invalid-grades";
  return null;
}

/** 고2 이상이고 1학년 자료가 충분하지 않으면 "1학년 자료 없이 진행" 을 보인다(No.51). */
export function canSkipFirstYear(
  track: Track,
  summary: Pick<CollectSummary, "firstYear">,
): boolean {
  return track !== "고1" && summary.firstYear.level !== "enough";
}

/** 저장된 활동 카드와 분석 대상 요약 카드의 묶음 건수. */
export function buildOverview(by: SourceCounts): {
  winning: number;
  upload: number;
  manual: number;
  total: number;
} {
  return {
    winning: by.performance + by.self + by.deep,
    upload: by.upload,
    manual: by.manual,
    total: by.total,
  };
}

export type CommitFailure =
  | { kind: "uploads-pending" }
  | { kind: "locked" }
  | { kind: "no-report" }
  | { kind: "other"; message: string };

const TIMEOUT_MESSAGE = "응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.";

export function classifyCommitError(
  result: Exclude<ApiResult<unknown>, { kind: "ok" }>,
): CommitFailure {
  if (result.kind === "timeout") {
    return { kind: "other", message: TIMEOUT_MESSAGE };
  }
  switch (result.code) {
    case "UPLOADS_PENDING":
      return { kind: "uploads-pending" };
    case "REPORT_LOCKED":
      return { kind: "locked" };
    case "NO_OPEN_REPORT":
      return { kind: "no-report" };
    default:
      return { kind: "other", message: result.message };
  }
}
