// 성장설계 트랙 규칙 모듈(순수 함수). 명세 번호는 각 함수 주석 참고.

import type { SemesterKey, Track } from "./types.js";

export type { SemesterKey, Track };

export type AnalysisRange = { semesters: SemesterKey[]; description: string };

const ALL_SEMESTERS: SemesterKey[] = [
  "고1-1",
  "고1-2",
  "고2-1",
  "고2-2",
  "고3-1",
  "고3-2",
];

const RANGE_GRADE: Record<Track, 1 | 2 | 3> = {
  고1: 1,
  고2: 2,
  고3: 3,
  졸업: 3,
  N수: 3,
};

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

/** 리포트에서 빠지는 항목과 사유(No.45 졸업, N수, No.50 고1, No.51 1학년 자료 없음). */
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

const SUFFICIENCY_LABELS: Record<Sufficiency, string> = {
  enough: "있음",
  insufficient: "부족",
  none: "없음",
};

/**
 * 활동 건수로 자료 충분도를 판정한다(No.44): 0 없음, 임계값 미만 부족, 이상 있음.
 * 임계값은 운영 설정값이라 호출자가 app_settings 에서 읽어 넘긴다(폴백 상수 없음).
 */
export function sufficiency(
  count: number,
  thresholds: { enough: number },
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
  thresholds: { enough: number },
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

const PERIOD_ORDER: Record<PlanPeriod, number> = {
  course_selection: 0,
  semester: 1,
  vacation: 2,
};
const MAX_PER_PRIORITY = 3;

/** 실행계획 배치(No.98, 99): 과목 선택(마감 빠른 순) → 남은 학기 → 방학, 묶음 안은 required 우선. 안정 정렬. */
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
      const byPriority =
        Number(a.it.priority !== "required") -
        Number(b.it.priority !== "required");
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map(({ it }) => it);
}

/** 항목 상한(No.96, 164): required 3건, 초과분은 recommended 로 강등, recommended 도 3건 상한이며 초과분은 dropped. 입력 순서가 우선순위. */
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
