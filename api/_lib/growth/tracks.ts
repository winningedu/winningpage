// 성장설계 트랙 규칙 모듈(순수 함수). 명세 번호는 각 함수 주석 참고.

export type Track = "고1" | "고2" | "고3" | "졸업" | "N수";
export type SemesterKey = "고1-1" | "고1-2" | "고2-1" | "고2-2" | "고3-1" | "고3-2";

export type AnalysisRange = { semesters: SemesterKey[]; description: string };

const ALL_SEMESTERS: SemesterKey[] = ["고1-1", "고1-2", "고2-1", "고2-2", "고3-1", "고3-2"];

const RANGE_GRADE: Record<Track, 1 | 2 | 3> = { 고1: 1, 고2: 2, 고3: 3, 졸업: 3, N수: 3 };

const RANGE_DESCRIPTION: Record<Track, string> = {
  고1: "1학년 현재까지가 분석 범위예요.",
  고2: "1학년 전체와 2학년 현재까지가 분석 범위예요. 리포트는 1학년 평가, 2학년 보완 방향, 3학년 콘셉트 순으로 짜여요.",
  고3: "1학년과 2학년 전체, 3학년 현재까지가 분석 범위예요. 실행계획은 월 단위로 나눠요.",
  졸업: "3개 학년 전체가 분석 범위예요. 씨앗, 꽃, 만개 로드맵 없이 진단만 나와요.",
  N수: "3개 학년 전체가 분석 범위예요. 씨앗, 꽃, 만개 로드맵 없이 진단만 나와요.",
};

/** 분석 범위(No.50, 시안 활동 선택 문구). current 가 있으면 그 학기까지만 포함한다. */
export function analysisRange(
  track: Track,
  current?: { grade: 1 | 2 | 3; semester: 1 | 2 },
): AnalysisRange {
  const maxGrade = RANGE_GRADE[track];
  let semesters = ALL_SEMESTERS.filter((k) => Number(k[1]) <= maxGrade);
  if (current) {
    const limit = (current.grade - 1) * 2 + current.semester;
    semesters = semesters.filter((k) => ALL_SEMESTERS.indexOf(k) < limit);
  }
  return { semesters, description: RANGE_DESCRIPTION[track] };
}

const ROADMAP_SECTIONS = ["3-1", "3-2", "3-3", "3-4"];

/** 리포트에서 빠지는 항목과 사유(No.45 졸업·N수, No.50 고1, No.51 1학년 자료 없음). */
export function omittedSections(
  track: Track,
  flags: { noFirstYearData?: boolean },
): { ids: string[]; reasons: string[] } {
  if (track === "졸업" || track === "N수") {
    return {
      ids: [...ROADMAP_SECTIONS],
      reasons: ["씨앗, 꽃, 만개 로드맵 없이 진단만 나와요"],
    };
  }
  const ids = new Set<string>();
  const reasons: string[] = [];
  if (track === "고1") {
    ids.add("3-2");
    ids.add("3-3");
    reasons.push("1학년 평가와 2학년 보완 방향은 아직 대상이 아니에요");
  }
  if (flags.noFirstYearData) {
    ids.add("3-2");
    reasons.push("성장 흐름은 2학년부터");
  }
  return { ids: ROADMAP_SECTIONS.filter((id) => ids.has(id)), reasons };
}

/** 실행계획 월 단위 여부(No.50): 고3 만 월 단위. */
export function monthlyPlan(track: Track): boolean {
  return track === "고3";
}

export type Sufficiency = "enough" | "insufficient" | "none";

/** 자료 충분도 임계값. 운영 설정값으로 대체될 예정이라 함수 인자로도 받는다(No.44). */
export const SUFFICIENCY_THRESHOLDS = { enough: 3 };

const SUFFICIENCY_LABELS: Record<Sufficiency, string> = {
  enough: "있음",
  insufficient: "부족",
  none: "없음",
};

/** 활동 건수로 자료 충분도를 판정한다(No.44): 0 없음, 임계값 미만 부족, 이상 있음. */
export function sufficiency(
  count: number,
  thresholds: { enough: number } = SUFFICIENCY_THRESHOLDS,
): Sufficiency {
  if (count <= 0) return "none";
  return count >= thresholds.enough ? "enough" : "insufficient";
}

export function sufficiencyLabel(level: Sufficiency): string {
  return SUFFICIENCY_LABELS[level];
}

/** 1학년 두 학기 합계 기준 충분도(No.44, 시작 화면 "1학년 자료 충분도"). */
export function firstYearSufficiency(
  bySemester: Partial<Record<SemesterKey, number>>,
  thresholds: { enough: number } = SUFFICIENCY_THRESHOLDS,
): { count: number; level: Sufficiency; label: string } {
  const count = (bySemester["고1-1"] ?? 0) + (bySemester["고1-2"] ?? 0);
  const level = sufficiency(count, thresholds);
  return { count, level, label: sufficiencyLabel(level) };
}

/** 기록이 없는 학기 안내 라벨(No.40). 기록이 있으면 null. */
export function semesterNotice(count: number): string | null {
  return count <= 0 ? "자료 없음, 업로드 권장" : null;
}

export type PlanPeriod = "course_selection" | "semester" | "vacation";
export type PlanPriority = "required" | "recommended";
export type PlanItem = {
  id: string;
  period: PlanPeriod;
  deadline?: string | null;
  priority: PlanPriority;
};

const PERIOD_ORDER: Record<PlanPeriod, number> = { course_selection: 0, semester: 1, vacation: 2 };
const MAX_PER_PRIORITY = 3;

/** 실행계획 배치(No.98·99): 과목 선택(마감 빠른 순) → 남은 학기 → 방학, 묶음 안은 required 우선. 안정 정렬. */
export function orderPlanPeriods<T extends PlanItem>(items: readonly T[]): T[] {
  return items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => {
      const byPeriod = PERIOD_ORDER[a.it.period] - PERIOD_ORDER[b.it.period];
      if (byPeriod !== 0) return byPeriod;
      if (a.it.period === "course_selection") {
        const da = a.it.deadline ?? null;
        const db = b.it.deadline ?? null;
        if (da !== db) {
          if (da === null) return 1;
          if (db === null) return -1;
          return da < db ? -1 : 1;
        }
      }
      const byPriority = Number(a.it.priority !== "required") - Number(b.it.priority !== "required");
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map(({ it }) => it);
}

/** 항목 상한(No.96·164): required 3건, 초과분은 recommended 로 강등, recommended 도 3건 상한이며 초과분은 dropped. 입력 순서가 우선순위. */
export function capPlanItems<T extends PlanItem>(
  items: readonly T[],
): { required: T[]; recommended: T[]; dropped: T[] } {
  const requiredAll = items.filter((i) => i.priority === "required");
  const recommendedAll = items.filter((i) => i.priority !== "required");
  const required = requiredAll.slice(0, MAX_PER_PRIORITY);
  const demoted = requiredAll
    .slice(MAX_PER_PRIORITY)
    .map((i) => ({ ...i, priority: "recommended" as const }));
  const pool = [...demoted, ...recommendedAll];
  return {
    required,
    recommended: pool.slice(0, MAX_PER_PRIORITY),
    dropped: pool.slice(MAX_PER_PRIORITY),
  };
}

const DAY_MS = 86_400_000;
const URGENT_DAYS = 7;

function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** 마감 상태(No.100): D-7 이하(지난 마감 포함)는 긴급. 마감 없으면 전부 null. */
export function deadlineState(
  deadline: string | null,
  today: string,
): { dday: number | null; urgent: boolean; label: string | null } {
  if (!deadline) return { dday: null, urgent: false, label: null };
  const dday = toDayNumber(deadline) - toDayNumber(today);
  return {
    dday,
    urgent: dday <= URGENT_DAYS,
    label: dday >= 0 ? `D-${dday}` : `D+${-dday}`,
  };
}

const REPORT_EXPIRY_DAYS = 90;

/** 마지막 활동 후 days(기본 90일)가 지나면 만료(No.115·116·139). 경계일 당일부터 만료. */
export function isExpired(
  lastActivityAt: string,
  now: string,
  days: number = REPORT_EXPIRY_DAYS,
): boolean {
  return Date.parse(now) - Date.parse(lastActivityAt) >= days * DAY_MS;
}

export type ReportRef = { id: string; status: string; issuedAt: string };

function latestOf<T extends ReportRef>(reports: readonly T[], match: (r: T) => boolean): T | null {
  let found: T | null = null;
  for (const r of reports) {
    if (!match(r)) continue;
    if (!found || Date.parse(r.issuedAt) > Date.parse(found.issuedAt)) found = r;
  }
  return found;
}

/** 현재 유효한 회차: 가장 최근 completed 1개(No.115·116). */
export function activeReport<T extends ReportRef>(reports: readonly T[]): T | null {
  return latestOf(reports, (r) => r.status === "completed");
}

/** 진행 중인 회차: draft 또는 in_progress 1개, 여럿이면 최신(No.115·116). */
export function openReport<T extends ReportRef>(reports: readonly T[]): T | null {
  return latestOf(reports, (r) => r.status === "draft" || r.status === "in_progress");
}

function normalizeCareer(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** 진로 변경 감지(No.56·147): 공백 정규화 후 비교. 이전 값이 없으면 변경이 아니다. */
export function careerChanged(previous: string | null, current: string | null): boolean {
  if (previous === null) return false;
  return normalizeCareer(previous) !== normalizeCareer(current);
}

const KST_OFFSET_MS = 9 * 3_600_000;

/** 학년도(3월 1일 KST 전환). 1~2월은 전년도 소속. */
function academicYear(iso: string): number {
  const d = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/**
 * 학년도 승급 제안(No.21). 프로필이 이전 학년도에 갱신됐고 고1·고2 면 다음 학년 1학기를 제안한다.
 * 고3 은 제안하지 않는다(졸업 후 처리는 결정 대기).
 */
export function shouldProposePromotion(
  profile: { grade: 1 | 2 | 3; semester: 1 | 2; updatedAt: string },
  now: string,
): { propose: boolean; next: { grade: 2 | 3; semester: 1 } | null } {
  const stale = academicYear(profile.updatedAt) < academicYear(now);
  if (!stale || profile.grade === 3) return { propose: false, next: null };
  return { propose: true, next: { grade: profile.grade === 1 ? 2 : 3, semester: 1 } };
}
