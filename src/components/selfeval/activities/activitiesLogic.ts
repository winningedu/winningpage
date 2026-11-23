import { siteWording } from "@/config/wording";
import {
  type ActivityRecordLike,
  type CandidateRow,
  GROWTH_STAGE_LABELS,
  type GrowthBanner,
  type GrowthSnapshot,
  type HighGrade,
  LINK_TYPE_LABELS,
  MAX_SUPPORT_ACTIVITIES,
  type PickListResponse,
} from "@/lib/selfeval/types";
import { schoolYearOf, ymdIn } from "@/lib/time/day";
import { strengthLabel } from "./linkMapLogic";

// 활동 선택 화면 순수 로직(명세 No.26~36, 107~113). 서버 규칙(api/_lib/selfeval/pick.ts 의
// autoSelect, applySelection)과 같은 판정을 클라이언트에서 미리 보여 주기 위한 사본이다.
// 확정은 항상 서버(pickSelect)가 다시 판정하므로 여기 결과는 표시용이다.

const isSameSubject = (r: CandidateRow): boolean =>
  r.fit?.signals.some((s) => s.key === "same_subject" && s.hit) === true;

const scoreOf = (r: CandidateRow): number => r.fit?.score ?? 0;

/** 재료로 쓸 수 있는 행. 계획 상태 등은 fit 이 없고 unavailableReason 이 있다. */
export const isSelectable = (r: CandidateRow): boolean =>
  r.fit !== null && r.unavailableReason === null;

export type DerivedRoles = {
  coreId: string | null;
  supportIds: string[];
  /** 핵심 활동이 이번 작성 과목의 활동이 아니다(명세 No.33, 시안 23). */
  coreMismatch: boolean;
  /** 보조를 두 건보다 많이 골랐다. 점수 높은 두 건만 쓴다. */
  tooMany: boolean;
  /** 이전 자기평가서에서 쓴 활동이 섞여 있다(시안 22, 29). */
  usedWarning: boolean;
};

/**
 * 고른 활동에서 핵심과 보조를 정한다. 작성 과목 활동이 있으면 그중 최고점이 핵심,
 * 없으면 전체 최고점이 핵심이고 coreMismatch 를 켠다. 나머지는 점수순 보조 최대 두 건이다.
 */
export function deriveRoles(
  selectedIds: readonly string[],
  candidates: readonly CandidateRow[],
  /** 핵심을 포함한 선택 상한. 서버가 준 maxSelect 를 넘긴다. 없으면 연계 확인 전의 3건이다. */
  maxSelect: number = MAX_SELECTED,
): DerivedRoles {
  const chosen = candidates
    .filter((r) => selectedIds.includes(r.activity.id) && isSelectable(r))
    // 안정 정렬이라 같은 점수면 목록 순서가 유지된다.
    .sort((a, b) => scoreOf(b) - scoreOf(a));
  const core = chosen.find(isSameSubject) ?? chosen[0];
  if (!core) {
    return {
      coreId: null,
      supportIds: [],
      coreMismatch: false,
      tooMany: false,
      usedWarning: false,
    };
  }
  const rest = chosen.filter((r) => r !== core);
  return {
    coreId: core.activity.id,
    supportIds: rest.slice(0, maxSelect - 1).map((r) => r.activity.id),
    coreMismatch: !isSameSubject(core),
    tooMany: rest.length > maxSelect - 1,
    usedWarning: chosen.some((r) => r.alreadyUsed),
  };
}

const MAX_SELECTED = 1 + MAX_SUPPORT_ACTIVITIES;

/**
 * 카드의 연계 칩 문구(명세 No.179, 185). 사용할 수 없는 행과 핵심 자신(0단계)에는 칩이 없다.
 * 연계 상태가 없거나 이어지지 않았으면 "연계 없음"이다.
 */
export function linkChipText(row: CandidateRow): string | null {
  if (row.fit === null) return null;
  const state = row.linkState;
  if (!state?.linked) return "연계 없음";
  if (state.hop === 0 || state.hop === null || state.type === null) return null;
  const strength = strengthLabel(state.strength, state.confirmed);
  return `연계됨, ${LINK_TYPE_LABELS[state.type]}, ${state.hop}단계, ${strength}`;
}

/** 선정 이유 줄(명세 No.32, 179). 서버가 만든 줄이 먼저이고 없으면 적합도 이유를 쓴다. */
export function reasonLinesOf(row: CandidateRow): string[] {
  return row.selectionReasons && row.selectionReasons.length > 0
    ? row.selectionReasons
    : (row.fit?.reasons ?? []);
}

/**
 * 체크 한 번의 결과. 사용할 수 없는 활동과 세 건 초과는 선택하지 않고 안내 문구를 돌려준다
 * (시안 15, 명세 No.36).
 */
export function toggleSelection(
  selectedIds: readonly string[],
  id: string,
  candidates: readonly CandidateRow[],
  maxSelect: number = MAX_SELECTED,
): { next: string[]; notice: string | null } {
  if (selectedIds.includes(id)) {
    return { next: selectedIds.filter((s) => s !== id), notice: null };
  }
  const row = candidates.find((r) => r.activity.id === id);
  if (row && !isSelectable(row)) {
    return {
      next: [...selectedIds],
      notice: row.unavailableReason ?? "재료로 쓸 수 없는 활동이에요",
    };
  }
  if (selectedIds.length >= maxSelect) {
    return {
      next: [...selectedIds],
      notice: `활동은 최대 ${maxSelect}건까지 고를 수 있어요`,
    };
  }
  return { next: [...selectedIds, id], notice: null };
}

/** 화면 첫 선택. 서버에 저장된 선택이 먼저이고 없으면 자동 추천이다. 기준 미달이면 비운다. */
export function initialSelection(
  pick: Pick<PickListResponse, "selection" | "auto">,
): string[] {
  if (pick.selection) {
    return [pick.selection.coreId, ...pick.selection.supportIds];
  }
  if (pick.auto?.coreId) return [pick.auto.coreId, ...pick.auto.supportIds];
  return [];
}

export type CandidateFilter = {
  academicYear?: number | undefined;
  gradeLabel?: HighGrade | undefined;
  semester?: 1 | 2 | undefined;
  subject?: string | undefined;
  source?: "performance" | "deep" | "manual" | undefined;
};

/** 후보 20건 안에서 거르는 클라이언트 필터. 비어 있는 조건은 쓰지 않는다. */
export function filterCandidates(
  rows: readonly CandidateRow[],
  filter: CandidateFilter,
  tz: string,
): CandidateRow[] {
  return rows.filter(({ activity: a }) => {
    if (filter.gradeLabel && a.gradeLabel !== filter.gradeLabel) return false;
    if (filter.semester && a.semester !== filter.semester) return false;
    if (filter.subject && a.subject !== filter.subject) return false;
    if (filter.source && a.sourceProgram !== filter.source) return false;
    if (
      filter.academicYear &&
      academicYearOf(a.createdAt, tz) !== filter.academicYear
    ) {
      return false;
    }
    return true;
  });
}

/** 기록 생성 시각이 속한 학년도(회원 시간대 tz 의 3월 1일에 시작). 해석할 수 없으면 null. */
export function academicYearOf(iso: string, tz: string): number | null {
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return schoolYearOf(iso, tz);
}

/** 카드 요약. 결과 앞부분만 잘라 보여 준다. 비어 있으면 null(그 줄을 그리지 않는다). */
export function summarizeResult(
  result: string | null,
  max: number,
): string | null {
  const t = result?.trim() ?? "";
  if (t === "") return null;
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

/** 카드 날짜. 회원 시간대 tz 기준 YYYY.MM.DD. 해석할 수 없으면 null. */
export function formatDotDate(iso: string, tz: string): string | null {
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return ymdIn(iso, tz).replaceAll("-", ".");
}

const SOURCE_LABELS: Record<ActivityRecordLike["sourceProgram"], string> = {
  performance: siteWording("위닝 수행평가"),
  deep: siteWording("위닝 심화탐구"),
  manual: "직접 입력",
  upload: "업로드",
  self: siteWording("위닝 자기평가서"),
};

export const sourceLabel = (
  source: ActivityRecordLike["sourceProgram"],
): string => SOURCE_LABELS[source];

/** 서버가 준 문자열 출처를 그대로 받는다. 표에 없는 값은 null. */
export const sourceLabelOrNull = (source: string): string | null =>
  Object.hasOwn(SOURCE_LABELS, source)
    ? SOURCE_LABELS[source as ActivityRecordLike["sourceProgram"]]
    : null;

/**
 * 세션이 고정한 성장설계 스냅샷에서 방향 배너 값을 만든다(서버 bannerSummary 와 같은 규칙).
 * 현재 학년 소주제가 먼저이고 학년을 모르면 단계가 같은 소주제, 그것도 없으면 가장 높은 학년이다.
 */
export function bannerFromSnapshot(
  snapshot: GrowthSnapshot,
  currentGrade: HighGrade | null,
): GrowthBanner {
  const subs = snapshot.gradeSubthemes;
  const current =
    (currentGrade ? subs.find((s) => s.grade === currentGrade) : undefined) ??
    (snapshot.stage
      ? subs.find((s) => s.stage === snapshot.stage)
      : undefined) ??
    [...subs].sort((a, b) => a.grade.localeCompare(b.grade)).at(-1);
  return {
    theme: snapshot.narrativeTheme,
    stageLabel: snapshot.stage ? GROWTH_STAGE_LABELS[snapshot.stage] : null,
    currentSubtheme: current?.text ?? null,
    weakAxisNames: snapshot.weakAxes.map((w) => w.name),
    issuedAt: snapshot.issuedAt,
  };
}
