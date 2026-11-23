// 연계 그래프, 연계 가점, 기여 항목, 선택 건수(명세 No.177~179). 모델 없이 결정론으로 센다.

import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type AnalysisField,
  CHARS_PER_ACTIVITY,
  DEFAULT_TARGET_CHARS,
  type LinkStrength,
  type LinkType,
  MAX_SELECTED_ACTIVITIES,
  MIN_SELECTED_ACTIVITIES,
  type RecordLink,
} from "./types.js";

export type LinkNode = {
  /** 핵심 기록은 0, 핵심과 직접 이어지면 1. */
  hop: number;
  /** 이 기록에 닿은 연계(핵심은 null). */
  type: LinkType | null;
  strength: LinkStrength | null;
  confirmed: boolean;
};

const edgeRank = (l: RecordLink): number =>
  l.strength === "explicit" || l.confirmed ? 1 : 0;

/** 지워지지 않은 연계를 무방향 선으로 보고 핵심에서 BFS 로 단계를 센다. 닿지 않는 기록은 들어 있지 않다. */
export function buildLinkGraph(
  links: RecordLink[],
  coreId: string,
): Map<string, LinkNode> {
  const live = links.filter((l) => !l.deleted);
  const nodes = new Map<string, LinkNode>([
    [coreId, { hop: 0, type: null, strength: null, confirmed: false }],
  ]);
  let frontier = [coreId];
  for (let hop = 1; frontier.length > 0; hop++) {
    const reached = new Map<string, RecordLink>();
    for (const id of frontier) {
      for (const l of live) {
        const other =
          l.fromId === id ? l.toId : l.toId === id ? l.fromId : null;
        if (other === null || nodes.has(other)) continue;
        const prev = reached.get(other);
        if (!prev || edgeRank(l) > edgeRank(prev)) reached.set(other, l);
      }
    }
    for (const [id, l] of reached) {
      nodes.set(id, {
        hop,
        type: l.type,
        strength: l.strength,
        confirmed: l.confirmed,
      });
    }
    frontier = [...reached.keys()];
  }
  return nodes;
}

/** 연계 가점. 암묵이어도 학생이 확인했으면 명시 점수다. 3단계 이상은 0. */
export function linkBonus(
  hop: number,
  strength: LinkStrength,
  confirmed: boolean,
): number {
  const strong = strength === "explicit" || confirmed;
  if (hop === 1) return strong ? 15 : 10;
  if (hop === 2) return strong ? 8 : 5;
  return 0;
}

/** 목표 글자 수가 비면 500자로 본다. 핵심을 포함한 건수다. */
export function maxSelectFor(targetChars: number | null): number {
  const n = Math.floor(
    (targetChars ?? DEFAULT_TARGET_CHARS) / CHARS_PER_ACTIVITY,
  );
  return Math.max(
    MIN_SELECTED_ACTIVITIES,
    Math.min(MAX_SELECTED_ACTIVITIES, n),
  );
}

const has = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "";

/** 기록 7항목이 11항목 가운데 어느 칸을 채우는지(명세 No.178). */
export function filledKeys(r: ActivityRecordLike): Set<AnalysisField> {
  const out = new Set<AnalysisField>();
  const add = (cond: boolean, ...keys: AnalysisField[]) => {
    if (cond) for (const k of keys) out.add(k);
  };
  add(has(r.topic), "motive");
  add(has(r.concept), "concept");
  add(has(r.method), "method", "action");
  add(has(r.result) || has(r.numbers), "result");
  add(has(r.limitation), "limitation");
  add(has(r.sources), "method");
  return new Set(ANALYSIS_FIELDS.filter((k) => out.has(k)));
}

/** 이미 채워진 칸을 빼고 이 기록이 새로 더하는 칸. */
export function newKeys(
  r: ActivityRecordLike,
  covered: ReadonlySet<AnalysisField>,
): Set<AnalysisField> {
  return new Set([...filledKeys(r)].filter((k) => !covered.has(k)));
}
