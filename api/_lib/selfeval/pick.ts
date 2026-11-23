// 활동 후보 목록, 자동 선택, 학생 선택 검증(명세 No.27, 28, 31, 33~36, 107, 110, 111).
// 핵심 활동은 "이번에 쓰는 과목의 기록"이어야 한다는 규칙을 서버에서도 강제한다(No.7, No.33).

import { computeFit, type FitContext } from "./fit.js";
import { recordStatusOf, submittedAtOf } from "./link.js";
import {
  type ActivityRecordLike,
  CANDIDATE_LIMIT,
  type CandidateRow,
  FALLBACK_SELECT_COUNT,
  FIT_AUTO_SELECT_THRESHOLD,
} from "./types.js";

export type PickContext = FitContext & { usedActivityIds: Set<string> };

const PLANNED_REASON = "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요";
const IN_PROGRESS_REASON = "아직 진행 중인 기록이라 근거로 쓸 수 없어요";
const USED_WARNING = "이전 자기평가서에서 쓴 활동이에요";
const SWAPPED_WARNING =
  "작성 과목과 같은 활동이 있어 그 활동을 핵심으로 바꿨어요";

const CANDIDATE_SOURCES: readonly ActivityRecordLike["sourceProgram"][] = [
  "performance",
  "deep",
  "manual",
];

const isSameSubject = (r: CandidateRow): boolean =>
  r.fit?.signals.some((s) => s.key === "same_subject" && s.hit) === true;

export function buildCandidates(
  records: ActivityRecordLike[],
  ctx: Omit<PickContext, "others">,
): CandidateRow[] {
  // 수행평가, 심화탐구, 직접 입력 기록만 후보다(명세 No.27). 자기평가서가 만든 기록(self)과
  // 업로드는 재료로 쓰지 않는다. 제출일 최신순이고, 정렬은 안정이라 같은 시각이면 입력 순서가 유지된다.
  const latest = records
    .filter((r) => CANDIDATE_SOURCES.includes(r.sourceProgram))
    .sort((a, b) => {
      const x = submittedAtOf(a);
      const y = submittedAtOf(b);
      return x < y ? 1 : x > y ? -1 : 0;
    })
    .slice(0, CANDIDATE_LIMIT);
  // 완료가 아닌 기록은 아직 한 일이 아니라서 반복 주제나 학기 간격 비교 대상에서도 뺀다.
  const comparable = latest.filter((r) => recordStatusOf(r) === "completed");

  return latest.map((activity) => {
    const alreadyUsed = ctx.usedActivityIds.has(activity.id);
    const recordStatus = recordStatusOf(activity);
    const base = {
      activity,
      alreadyUsed,
      role: null,
      recordStatus,
      submittedAt: submittedAtOf(activity),
    };
    if (recordStatus !== "completed") {
      return {
        ...base,
        fit: null,
        unavailableReason:
          recordStatus === "plan" ? PLANNED_REASON : IN_PROGRESS_REASON,
      };
    }
    return {
      ...base,
      fit: computeFit(activity, {
        ...ctx,
        others: comparable.filter((o) => o.id !== activity.id),
      }),
      unavailableReason: null,
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
  const available = rows.filter((r) => r.fit !== null).sort(byScoreDesc);
  const eligible = available.filter(
    (r) => (r.fit?.score ?? 0) >= FIT_AUTO_SELECT_THRESHOLD,
  );
  // 작성 과목이나 영역의 기록이 있으면 점수와 무관하게 그것이 핵심이다(명세 No.7, 31).
  const best = available.find(isSameSubject);
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
      .slice(0, FALLBACK_SELECT_COUNT - 1)
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
  /** 핵심을 포함한 선택 상한. 연계 확인이 없으면 추천과 같은 3건이다. */
  maxSelect: number = FALLBACK_SELECT_COUNT,
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
  if (supportIds.length + 1 > maxSelect) {
    return {
      ok: false,
      code: "TOO_MANY_SUPPORT",
      message: `활동은 최대 ${maxSelect}건까지 고를 수 있어요.`,
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
