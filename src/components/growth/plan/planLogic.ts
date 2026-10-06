import type {
  PlanBody,
  PlanGroup,
  PlanItemChangeResponse,
  PlanItemView,
  PlanProgram,
  PlanProgress,
  ProgramHandoff,
} from "@/lib/growth/api";
import { formatKoreanDate } from "../reports/reportsLogic";

// 실행계획 화면의 순수 로직. 화면 컴포넌트는 이 파일의 결과만 그린다.

// ── 라벨 ──────────────────────────────────────────────────────────────
// 서버 api/_lib/growth/axes.ts 의 AXIS_NAMES 와 같은 값. api/ 는 프런트에서 import 하지 않는다.
export const AXIS_NAMES: Record<string, string> = {
  A: "학업역량",
  B: "진로 및 전공적합성",
  C: "탐구 및 자기주도성",
  D: "공동체역량",
  E: "발전가능성",
};

export const PROGRAM_LABELS: Record<PlanProgram, string> = {
  school: "학교",
  self: "위닝 자기평가서",
  deep: "위닝 심화탐구",
};

export const PRIORITY_LABELS = {
  required: "반드시",
  recommended: "있으면 좋음",
} as const;

export function axisLabel(axis: string | null): string | null {
  if (!axis) return null;
  const name = AXIS_NAMES[axis];
  return name ? `${axis} ${name}` : axis;
}

// ── 항목 갱신(낙관적 갱신과 롤백) ─────────────────────────────────────
/** 진행률. 전체 항목은 groups 기준이다(carried 는 groups 에도 들어 있어 중복 집계하면 안 된다). */
export function computeProgress(groups: PlanGroup[]): PlanProgress {
  const items = groups.flatMap((g) => g.items);
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return {
    total,
    done,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** 같은 id 의 항목을 groups 와 carried 양쪽에서 바꾸고 진행률을 다시 센다. 원본은 바꾸지 않는다. */
export function applyItemPatch(plan: PlanBody, item: PlanItemView): PlanBody {
  const swap = (i: PlanItemView) => (i.id === item.id ? item : i);
  const groups = plan.groups.map((g) => ({ ...g, items: g.items.map(swap) }));
  return {
    ...plan,
    groups,
    carried: plan.carried.map(swap),
    progress: computeProgress(groups),
  };
}

export function findItem(
  plan: PlanBody,
  itemId: string,
): PlanItemView | undefined {
  for (const g of plan.groups) {
    const found = g.items.find((i) => i.id === itemId);
    if (found) return found;
  }
  return plan.carried.find((i) => i.id === itemId);
}

/** 체크 낙관적 갱신. 수동 체크로 완료 처리하고 진행률을 즉시 다시 센다. */
export function applyOptimisticCheck(
  plan: PlanBody,
  itemId: string,
  done: boolean,
  nowIso: string,
): PlanBody {
  const current = findItem(plan, itemId);
  if (!current) return plan;
  return applyItemPatch(plan, {
    ...current,
    done,
    doneSource: done ? "manual" : null,
    doneAt: done ? nowIso : null,
  });
}

/** 낙관적 갱신 롤백. 그 항목만 원래대로 되돌려 다른 항목의 동시 변경을 건드리지 않는다. */
export function rollbackItem(plan: PlanBody, original: PlanItemView): PlanBody {
  return applyItemPatch(plan, original);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 성공 응답(changed true)의 item, progress, nextDeadline, metrics 로 캐시를 갱신한다. */
export function applyServerChange(
  plan: PlanBody,
  response: PlanItemChangeResponse,
): PlanBody {
  const next = applyItemPatch(plan, response.item);
  if (!response.changed) return next;
  const extra = response as Record<string, unknown>;
  return {
    ...next,
    progress: response.progress,
    metrics: response.metrics,
    nextDeadline:
      "nextDeadline" in extra ? extra.nextDeadline : plan.nextDeadline,
  };
}

// ── 오류 분기 ─────────────────────────────────────────────────────────
export type CheckFailure = {
  /** 낙관적 갱신을 되돌리는지. 모든 실패에서 true 다. */
  rollback: true;
  /** 서버 상태를 다시 불러오는지. */
  refetch: boolean;
  message: string;
};

export function checkFailureOutcome(code: string | null): CheckFailure {
  switch (code) {
    case "CONFLICT":
      return {
        rollback: true,
        refetch: true,
        message: "다른 곳에서 먼저 바뀌어서 최신 상태를 다시 불러왔어요.",
      };
    case "REPORT_NOT_LATEST":
      return {
        rollback: true,
        refetch: true,
        message:
          "더 최근 회차가 생겨서 이 계획은 바꿀 수 없어요. 최신 실행계획을 다시 불러왔어요.",
      };
    case "PROGRAM_DONE_LOCKED":
      return {
        rollback: true,
        refetch: false,
        message: "연동 프로그램에서 확정된 과제라서 체크를 해제할 수 없어요.",
      };
    default:
      return {
        rollback: true,
        refetch: false,
        message: "변경하지 못했어요. 잠시 후 다시 시도해 주세요.",
      };
  }
}

// ── 마감일 ────────────────────────────────────────────────────────────
/** YYYY-MM-DD 형식이면서 실제 달력에 있는 날짜인지. */
export function isValidDeadline(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/** 날짜 입력값을 PATCH 의 deadline 으로 바꾼다. 빈 값은 해제(null), 잘못된 값은 undefined. */
export function toDeadlinePayload(value: string): string | null | undefined {
  if (value === "") return null;
  return isValidDeadline(value) ? value : undefined;
}

/** 마감일 입력은 과목 선택 시기 항목에만 둔다(서버가 다른 시기는 DEADLINE_NOT_ALLOWED). */
export function canSetDeadline(item: PlanItemView): boolean {
  return item.period === "course_selection";
}

// ── 항목 표시 ─────────────────────────────────────────────────────────
/** 체크 해제 가능 여부. 연동 프로그램이 확정한 완료는 해제할 수 없다. */
export function isUncheckLocked(item: PlanItemView): boolean {
  return (
    item.done && (item.doneSource === "self" || item.doneSource === "deep")
  );
}

export function groupPeriodLabel(group: PlanGroup): string | null {
  return group.items.find((i) => i.periodLabel)?.periodLabel ?? null;
}

export function progressNote(item: PlanItemView, hasHandoff: boolean): string {
  if (item.program === "school") return "진행: 직접 체크";
  const name = PROGRAM_LABELS[item.program];
  return hasHandoff
    ? `진행: ${name}에서 확정하면 자동으로 완료돼요. 직접 체크해도 돼요.`
    : "진행: 직접 체크. 위닝 프로그램을 쓰지 않아도 하면 체크해요.";
}

/** 완료 항목의 출처 배지. 완료가 아니면 null. */
export function doneBadge(item: PlanItemView): string | null {
  if (!item.done) return null;
  if (item.doneSource === "self" || item.doneSource === "deep") {
    return `${PROGRAM_LABELS[item.doneSource]}에서 확정, 자동 완료`;
  }
  return item.program === "school" ? null : "직접 체크로 완료";
}

export function handoffButtonLabel(program: PlanProgram): string | null {
  if (program === "self") return "위닝 자기평가서에서 하기";
  if (program === "deep") return "위닝 심화탐구에서 하기";
  return null;
}

/** 연동 버튼을 보일지. 전달값이 있는 미완료 self, deep 항목만. */
export function showHandoffButton(
  item: PlanItemView,
  handoffs: Record<string, ProgramHandoff>,
): boolean {
  return !item.done && item.program !== "school" && item.id in handoffs;
}

// ── 연동 이동 ─────────────────────────────────────────────────────────
export const HANDOFF_STORAGE_KEY = "growth:handoff";

/** 송신측 서비스가 아직 없어 서비스 소개 랜딩으로 보낸다(라우트: serviceLandingRoutes.tsx). */
export function handoffDestination(program: PlanProgram): string {
  if (program === "self") return "/services/self-assessment";
  if (program === "deep") return "/services/research";
  return "/services";
}

export type HandoffRow = { label: string; value: string };

/** 이동 모달의 "함께 넘어가는 값" 목록. 값이 없는 줄은 만들지 않는다. */
export function buildHandoffRows(
  handoff: ProgramHandoff,
  issuedAt: string | null,
): HandoffRow[] {
  const rows: HandoffRow[] = [];
  const issued = formatKoreanDate(issuedAt);
  if (issued)
    rows.push({ label: "발행 리포트", value: `${issued} 발행 리포트` });
  if (handoff.theme) rows.push({ label: "서사 대주제", value: handoff.theme });
  if (handoff.subtheme)
    rows.push({ label: "학년 소주제", value: handoff.subtheme });
  const stage = [handoff.currentGrade, handoff.stage]
    .filter((v): v is string => !!v)
    .join(" ");
  if (stage) rows.push({ label: "학년 단계", value: stage });
  const axis = axisLabel(handoff.condition.axis);
  if (axis) rows.push({ label: "대상 축", value: axis });
  rows.push({ label: "활동 조건", value: handoff.condition.title });
  if (handoff.condition.description)
    rows.push({ label: "조건 설명", value: handoff.condition.description });
  return rows;
}

type StorageLike = Pick<Storage, "setItem">;

/** 전달값을 sessionStorage 에 JSON 으로 보관한다. 저장소를 못 쓰는 환경에서는 false. */
export function storeHandoff(
  handoff: ProgramHandoff,
  storage: StorageLike | null,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    return true;
  } catch {
    return false;
  }
}

// ── 이월 ──────────────────────────────────────────────────────────────
export type CarriedSection = {
  count: number;
  items: PlanItemView[];
};

/** 이월 과제가 없으면 null. 상단 접이식 카드의 데이터다. */
export function carriedSection(plan: PlanBody): CarriedSection | null {
  if (plan.carried.length === 0) return null;
  return { count: plan.carried.length, items: plan.carried };
}

// ── 완료하면 달라지는 것 ──────────────────────────────────────────────
type Snapshot = {
  consistency: { percent: number | null; verdictLabel: string | null };
  axes: { axis: string; name: string; count: number; verdictLabel: string }[];
};

type ParsedMetrics = {
  now: Snapshot;
  afterAll: Snapshot;
  changedAxesRemaining: string[];
};

function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || !isRecord(value.consistency)) return null;
  const { percent, verdictLabel } = value.consistency;
  if (percent !== null && typeof percent !== "number") return null;
  if (verdictLabel !== null && typeof verdictLabel !== "string") return null;
  if (!Array.isArray(value.axes)) return null;
  const axes: Snapshot["axes"] = [];
  for (const a of value.axes) {
    if (
      !isRecord(a) ||
      typeof a.axis !== "string" ||
      typeof a.count !== "number" ||
      typeof a.verdictLabel !== "string"
    )
      return null;
    axes.push({
      axis: a.axis,
      name:
        typeof a.name === "string" ? a.name : (AXIS_NAMES[a.axis] ?? a.axis),
      count: a.count,
      verdictLabel: a.verdictLabel,
    });
  }
  return { consistency: { percent, verdictLabel }, axes };
}

/** 서버 metrics(타입이 unknown)를 읽는다. 모양이 다르거나 null 이면 null. */
export function parseMetrics(value: unknown): ParsedMetrics | null {
  if (!isRecord(value)) return null;
  const now = parseSnapshot(value.now);
  const afterAll = parseSnapshot(value.afterAll);
  if (!now || !afterAll) return null;
  const remaining = Array.isArray(value.changedAxesRemaining)
    ? value.changedAxesRemaining.filter(
        (a): a is string => typeof a === "string",
      )
    : [];
  return { now, afterAll, changedAxesRemaining: remaining };
}

export type ChangeRow = {
  key: string;
  label: string;
  now: string;
  after: string;
  /** 판정 라벨이 지금과 완료 후에 따로 있으면 채운다. */
  nowVerdict: string | null;
  afterVerdict: string | null;
};

function percentText(s: Snapshot): string | null {
  return s.consistency.percent === null ? null : `${s.consistency.percent}%`;
}

/** 지금과 모두 완료했을 때를 비교하는 표 행. metrics 가 없으면 null("자료 없음"). */
export function buildChangeRows(metrics: unknown): ChangeRow[] | null {
  const parsed = parseMetrics(metrics);
  if (!parsed) return null;
  const { now, afterAll, changedAxesRemaining } = parsed;
  const rows: ChangeRow[] = [];

  const nowPct = percentText(now);
  const afterPct = percentText(afterAll);
  rows.push({
    key: "consistency",
    label: "방향 일관성",
    now: nowPct ?? now.consistency.verdictLabel ?? "자료 없음",
    after: afterPct ?? afterAll.consistency.verdictLabel ?? "자료 없음",
    nowVerdict: nowPct ? now.consistency.verdictLabel : null,
    afterVerdict: afterPct ? afterAll.consistency.verdictLabel : null,
  });

  for (const entry of now.axes) {
    const after = afterAll.axes.find((a) => a.axis === entry.axis);
    if (!after) continue;
    const changed =
      changedAxesRemaining.includes(entry.axis) || after.count !== entry.count;
    if (!changed) continue;
    rows.push({
      key: `axis-${entry.axis}`,
      label: `${entry.axis} ${entry.name} 근거`,
      now: `${entry.count}건`,
      after: `${after.count}건`,
      nowVerdict: entry.verdictLabel,
      afterVerdict: after.verdictLabel,
    });
  }
  return rows;
}

/** avoidRepeats(타입이 unknown[])에서 문구만 뽑는다. 문자열이거나 text 필드가 있는 항목. */
export function parseAvoidRepeats(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && v) out.push(v);
    else if (isRecord(v) && typeof v.text === "string" && v.text)
      out.push(v.text);
  }
  return out;
}
