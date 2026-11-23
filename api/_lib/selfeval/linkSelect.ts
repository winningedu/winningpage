// 연계 기반 자동 선택과 후보 표시 값(명세 No.32, 144, 179, 195, 196). 순수 모듈이다.

import {
  buildLinkGraph,
  filledKeys,
  type LinkNode,
  linkBonus,
  maxSelectFor,
  newKeys,
} from "./linkGraph.js";
import { autoSelect } from "./pick.js";
import {
  type AnalysisField,
  type CandidateRow,
  FALLBACK_SELECT_COUNT,
  FIT_AUTO_SELECT_THRESHOLD,
  LINK_TYPE_LABELS,
  type RecordLink,
} from "./types.js";

export type LinkingInput = {
  /** 저장된 연계. 연계 확인이 안 됐거나 실패했으면 null. */
  links: RecordLink[] | null;
  targetChars: number | null;
};

export type LinkEvaluation = {
  coreId: string | null;
  supportIds: string[];
  coreMismatch: boolean;
  noneAboveThreshold: boolean;
  /** 연계 확인이 안 돼 적합도 상위 3건만 추천한 경우. */
  fallback: boolean;
  /** 핵심을 포함한 선택 상한. */
  maxSelect: number;
  graph: Map<string, LinkNode>;
  bonus: Record<string, number>;
  contribution: Record<string, number>;
};

const score = (r: CandidateRow): number => r.fit?.score ?? 0;

/** 핵심과 연계된 기록 중 적합도 40 이상이고 새로 더하는 항목이 있는 기록을 "적합도 + 가점" 순으로 고른다. */
export function evaluateSelection(
  rows: CandidateRow[],
  linking: LinkingInput,
): LinkEvaluation {
  const base = autoSelect(rows);
  const empty = {
    graph: new Map<string, LinkNode>(),
    bonus: {},
    contribution: {},
  };
  if (base.coreId === null) {
    return {
      ...base,
      fallback: linking.links === null,
      maxSelect: maxSelectFor(linking.targetChars),
      ...empty,
    };
  }
  if (linking.links === null) {
    return {
      ...base,
      fallback: true,
      maxSelect: FALLBACK_SELECT_COUNT,
      ...empty,
    };
  }

  const maxSelect = maxSelectFor(linking.targetChars);
  const coreId = base.coreId;
  const core = rows.find((r) => r.activity.id === coreId) as CandidateRow;
  const graph = buildLinkGraph(linking.links, coreId);
  const bonus: Record<string, number> = {};
  for (const [id, node] of graph) {
    if (node.hop > 0 && node.strength !== null) {
      bonus[id] = linkBonus(node.hop, node.strength, node.confirmed);
    }
  }

  const covered = new Set<AnalysisField>(filledKeys(core.activity));
  const contribution: Record<string, number> = {};
  const supportIds: string[] = [];
  const linked = rows
    .filter(
      (r) =>
        r.fit !== null && r.activity.id !== coreId && graph.has(r.activity.id),
    )
    .sort(
      (a, b) =>
        score(b) +
        (bonus[b.activity.id] ?? 0) -
        (score(a) + (bonus[a.activity.id] ?? 0)),
    );
  for (const r of linked) {
    const fresh = newKeys(r.activity, covered);
    contribution[r.activity.id] = fresh.size;
    const qualifies = score(r) >= FIT_AUTO_SELECT_THRESHOLD && fresh.size > 0;
    if (qualifies && supportIds.length + 1 < maxSelect) {
      supportIds.push(r.activity.id);
      for (const k of fresh) covered.add(k);
    }
  }
  // 연계 없는 기록의 기여는 핵심만 기준으로 센다.
  const coreKeys = filledKeys(core.activity);
  for (const r of rows) {
    if (
      r.fit !== null &&
      r.activity.id !== coreId &&
      !graph.has(r.activity.id)
    ) {
      contribution[r.activity.id] = newKeys(r.activity, coreKeys).size;
    }
  }
  return {
    coreId,
    supportIds,
    coreMismatch: base.coreMismatch,
    noneAboveThreshold: false,
    fallback: false,
    maxSelect,
    graph,
    bonus,
    contribution,
  };
}

const NOT_LINKED = {
  linked: false,
  hop: null,
  type: null,
  strength: null,
  confirmed: false,
} as const;

/** 후보 한 줄에 연계 상태, 가점, 기여 수, 선정 이유(최소 한 줄)를 붙인다. */
export function annotateRows(
  rows: CandidateRow[],
  ev: LinkEvaluation,
): CandidateRow[] {
  return rows.map((r) => {
    if (r.fit === null) return { ...r, linkState: null, selectionReasons: [] };
    const id = r.activity.id;
    const node = ev.graph.get(id);
    const reasons = [...r.fit.reasons];
    if (node && node.hop > 0 && node.type !== null) {
      const label = LINK_TYPE_LABELS[node.type];
      reasons.push(
        node.hop === 1
          ? `핵심 기록과 직접 이어져요 (${label})`
          : `핵심 기록에서 ${node.hop}단계 거쳐 이어져요 (${label})`,
      );
    }
    if (reasons.length === 0)
      reasons.push(`이 기록의 적합도는 ${r.fit.score}점이에요`);
    const linkState = node
      ? {
          linked: true,
          hop: node.hop,
          type: node.type,
          strength: node.strength,
          confirmed: node.confirmed,
        }
      : ev.fallback || ev.coreId === null
        ? null
        : NOT_LINKED;
    return {
      ...r,
      linkState,
      bonus: ev.bonus[id] ?? 0,
      contribution: ev.contribution[id] ?? 0,
      selectionReasons: reasons,
    };
  });
}
