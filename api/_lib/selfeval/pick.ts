// 활동 후보 목록, 자동 선택, 학생 선택 검증(명세 No.27, 28, 31, 33~36, 107, 110, 111).
// 핵심 활동은 "이번에 쓰는 과목의 기록"이어야 한다는 규칙을 서버에서도 강제한다(No.7, No.33).

import { computeFit, type FitContext } from "./fit.js";
import {
  type ActivityRecordLike,
  CANDIDATE_LIMIT,
  type CandidateRow,
  FIT_AUTO_SELECT_THRESHOLD,
  MAX_SUPPORT_ACTIVITIES,
} from "./types.js";

export type PickContext = FitContext & { usedActivityIds: Set<string> };

const PLANNED_REASON = "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요";
const USED_WARNING = "이전 자기평가서에서 쓴 활동이에요";
const SWAPPED_WARNING =
  "작성 과목과 같은 활동이 있어 그 활동을 핵심으로 바꿨어요";

const isSameSubject = (r: CandidateRow): boolean =>
  r.fit?.signals.some((s) => s.key === "same_subject" && s.hit) === true;

export function buildCandidates(
  records: ActivityRecordLike[],
  ctx: Omit<PickContext, "others">,
): CandidateRow[] {
  // 자기평가서가 만든 기록(self)은 재료로 다시 쓰지 않는다. 고객사 의견.
  // Array.prototype.sort 는 안정 정렬이라 같은 시각이면 입력 순서가 유지된다.
  const latest = records
    .filter((r) => r.sourceProgram !== "self")
    .sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    )
    .slice(0, CANDIDATE_LIMIT);
  // 계획 상태는 아직 한 일이 아니라서 반복 주제나 학기 간격 비교 대상에서도 뺀다.
  const comparable = latest.filter((r) => r.status !== "planned");

  return latest.map((activity) => {
    const alreadyUsed = ctx.usedActivityIds.has(activity.id);
    if (activity.status === "planned") {
      return {
        activity,
        fit: null,
        unavailableReason: PLANNED_REASON,
        alreadyUsed,
        role: null,
      };
    }
    return {
      activity,
      fit: computeFit(activity, {
        ...ctx,
        others: comparable.filter((o) => o.id !== activity.id),
      }),
      unavailableReason: null,
      alreadyUsed,
      role: null,
    };
  });
}

const byScoreDesc = (a: CandidateRow, b: CandidateRow) =>
  (b.fit?.score ?? 0) - (a.fit?.score ?? 0);

export function autoSelect(
  rows: CandidateRow[],
  // 현재 규칙은 행의 신호만 읽는다. 호출부가 같은 컨텍스트를 넘기도록 시그니처만 맞춘다.
  _ctx?: Omit<PickContext, "others">,
): {
  coreId: string | null;
  supportIds: string[];
  coreMismatch: boolean;
  noneAboveThreshold: boolean;
} {
  const eligible = rows
    .filter((r) => r.fit !== null && r.fit.score >= FIT_AUTO_SELECT_THRESHOLD)
    .sort(byScoreDesc);
  const best = eligible.find(isSameSubject);
  const core = best ?? eligible[0];
  if (!core) {
    return {
      coreId: null,
      supportIds: [],
      coreMismatch: false,
      noneAboveThreshold: true,
    };
  }
  return {
    coreId: core.activity.id,
    supportIds: eligible
      .filter((r) => r !== core)
      .slice(0, MAX_SUPPORT_ACTIVITIES)
      .map((r) => r.activity.id),
    coreMismatch: best === undefined,
    noneAboveThreshold: false,
  };
}

export type ApplySelectionResult =
  | {
      ok: true;
      coreId: string;
      supportIds: string[];
      coreMismatch: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      code:
        | "CORE_REQUIRED"
        | "UNAVAILABLE"
        | "UNKNOWN_ACTIVITY"
        | "TOO_MANY_SUPPORT";
      message: string;
    };

export function applySelection(
  rows: CandidateRow[],
  selection: { coreId: string; supportIds: string[] },
  _ctx?: Omit<PickContext, "others">,
): ApplySelectionResult {
  if (selection.coreId === "") {
    return {
      ok: false,
      code: "CORE_REQUIRED",
      message: "핵심 활동을 하나 골라 주세요.",
    };
  }
  const supportIds = [...new Set(selection.supportIds)].filter(
    (id) => id !== selection.coreId,
  );
  if (supportIds.length > MAX_SUPPORT_ACTIVITIES) {
    return {
      ok: false,
      code: "TOO_MANY_SUPPORT",
      message: `보조 활동은 최대 ${MAX_SUPPORT_ACTIVITIES}개까지 고를 수 있어요.`,
    };
  }
  const byId = new Map(rows.map((r) => [r.activity.id, r]));
  const chosen: CandidateRow[] = [];
  for (const id of [selection.coreId, ...supportIds]) {
    const r = byId.get(id);
    if (!r) {
      return {
        ok: false,
        code: "UNKNOWN_ACTIVITY",
        message: "목록에 없는 활동이에요.",
      };
    }
    if (r.fit === null) {
      return {
        ok: false,
        code: "UNAVAILABLE",
        message: r.unavailableReason ?? "재료로 쓸 수 없는 활동이에요.",
      };
    }
    chosen.push(r);
  }

  const warnings: string[] = [];
  let core = chosen[0] as CandidateRow;
  let supports = chosen.slice(1);
  if (!isSameSubject(core)) {
    const sameSubject = supports.filter(isSameSubject).sort(byScoreDesc)[0];
    if (sameSubject) {
      supports = [core, ...supports.filter((r) => r !== sameSubject)];
      core = sameSubject;
      warnings.push(SWAPPED_WARNING);
    }
  }
  if ([core, ...supports].some((r) => r.alreadyUsed)) {
    warnings.push(USED_WARNING);
  }
  return {
    ok: true,
    coreId: core.activity.id,
    supportIds: supports.map((r) => r.activity.id),
    coreMismatch: !isSameSubject(core),
    warnings,
  };
}

export function assignRoles(
  rows: CandidateRow[],
  coreId: string,
  supportIds: string[],
): CandidateRow[] {
  return rows.map((r) => ({
    ...r,
    role:
      r.activity.id === coreId
        ? "core"
        : supportIds.includes(r.activity.id)
          ? "support"
          : null,
  }));
}

export function sourceCounts(records: ActivityRecordLike[]): {
  performance: number;
  deep: number;
  manual: number;
  total: number;
} {
  const out = { performance: 0, deep: 0, manual: 0, total: 0 };
  for (const r of records) {
    if (r.sourceProgram === "self") continue;
    out.total += 1;
    if (r.sourceProgram === "performance") out.performance += 1;
    else if (r.sourceProgram === "deep") out.deep += 1;
    else if (r.sourceProgram === "manual") out.manual += 1;
  }
  return out;
}
