// 본문 생성과 검증에서 쓰는 기록 연계 규칙(명세 No.181~195). 순수 함수만 둔다.

import { buildLinkGraph } from "./linkGraph.js";
import { extractKeywords, extractNumbers } from "./text.js";
import {
  type ActivityRecordLike,
  LINK_TYPE_LABELS,
  LINK_TYPES,
  type LinkCheck,
  type LinkStrength,
  type LinkType,
  type RecordLink,
  type Sentence,
} from "./types.js";

/** selfeval_record_links 한 줄(지운 연결 포함). 유형은 DB 값 그대로라 문자열이다. */
export type LinkInfo = {
  fromRecordId: string;
  toRecordId: string;
  linkType: string;
  strength: LinkStrength;
  source: "model" | "student";
  confirmed: boolean;
  deleted: boolean;
  note: string | null;
  quoteFrom: string | null;
  quoteTo: string | null;
};

/** 생성 입력에 넘기는 구체물 낱말의 상한(명세 No.189). */
const MAX_CARRIED_WORDS = 4;

const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x !== "")
    : [];

/**
 * 앞 기록의 7항목에서 뽑은, 연계 문장에 적을 구체물 낱말(명세 No.189). 개념명, 자료명, 방법명,
 * 수치를 한 낱말씩 번갈아 최대 네 개를 낸다. 같은 기록이면 항상 같은 결과다.
 */
export function carriedWords(record: ActivityRecordLike): string[] {
  const pools = [
    extractKeywords(record.concept ?? ""),
    asStrings(record.sources),
    extractKeywords(record.method ?? ""),
    asStrings(record.numbers).flatMap((n) => extractNumbers(n)),
  ];
  const out: string[] = [];
  const queues = pools.map((p) => [...p]);
  while (out.length < MAX_CARRIED_WORDS && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      let w = q.shift();
      while (w !== undefined && out.includes(w)) w = q.shift();
      if (w !== undefined && out.length < MAX_CARRIED_WORDS) out.push(w);
    }
  }
  return out;
}

/**
 * 연결 행(지운 행 포함)이 한 줄도 닿지 않은 선택 기록 id(명세 No.180). 이 기록은 학생이 한 줄을
 * 쓰지 않았으므로 생성 입력과 근거에서 뺀다. 연계를 모두 지운 기록은 행이 남아 있어 여기에 들지 않고
 * 기여 항목으로만 쓴다(명세 No.194). 핵심에 닿는지는 보지 않는다(그 판단은 supportLinkStates).
 */
export function neverLinkedIds(
  ids: readonly string[],
  ends: ReadonlyArray<readonly [string, string]>,
): string[] {
  const touched = new Set(ends.flat());
  return ids.filter((id) => !touched.has(id));
}

export type SupportLinkState = {
  id: string;
  /** link 는 연계 문장을 쓰고, contribute 는 기여 항목으로만 쓴다. */
  mode: "link" | "contribute";
  reason: "linked" | "implicit_unconfirmed" | "no_link";
  hop: number | null;
  typeLabel: string | null;
  strength: LinkStrength | null;
  confirmed: boolean;
  /** 연계 선에 적힌 양쪽 인용. */
  quotes: string[];
  /** 앞 기록에서 뽑은 구체물 낱말. contribute 면 빈 배열. */
  carried: string[];
};

const isLinkType = (v: string): v is LinkType =>
  (LINK_TYPES as readonly string[]).includes(v);

const toRecordLink = (l: LinkInfo): RecordLink | null =>
  isLinkType(l.linkType)
    ? {
        fromId: l.fromRecordId,
        toId: l.toRecordId,
        type: l.linkType,
        strength: l.strength,
        source: l.source,
        confirmed: l.confirmed,
        deleted: l.deleted,
        note: l.note,
        quoteFrom: l.quoteFrom,
        quoteTo: l.quoteTo,
      }
    : null;

const rank = (l: RecordLink): number =>
  l.strength === "explicit" || l.confirmed ? 1 : 0;

const noLink = (id: string): SupportLinkState => ({
  id,
  mode: "contribute",
  reason: "no_link",
  hop: null,
  typeLabel: null,
  strength: null,
  confirmed: false,
  quotes: [],
  carried: [],
});

/**
 * 핵심이 아닌 선택 기록마다 본문에서 연계 문장을 쓸지 정한다(명세 No.181, 189, 193~195).
 * 지운 연계는 없는 것으로 본다. 핵심에 닿지 않는 기록과, 암묵이면서 학생이 확인하지 않은
 * 기록은 기여 항목으로만 쓴다. 연계 기록의 구체물 낱말은 연계 선의 앞 기록(from)에서 뽑는다.
 */
export function supportLinkStates(
  records: ActivityRecordLike[],
  coreId: string,
  supportIds: string[],
  infos: LinkInfo[],
): Map<string, SupportLinkState> {
  const links = infos.flatMap((l) => {
    const one = toRecordLink(l);
    return one === null ? [] : [one];
  });
  const live = links.filter((l) => !l.deleted);
  const graph = buildLinkGraph(links, coreId);
  const out = new Map<string, SupportLinkState>();
  for (const id of supportIds) {
    const node = graph.get(id);
    if (node === undefined || node.hop === 0) {
      out.set(id, noLink(id));
      continue;
    }
    const chosen = live
      .filter((l) => {
        const other =
          l.fromId === id ? l.toId : l.toId === id ? l.fromId : null;
        return other !== null && graph.get(other)?.hop === node.hop - 1;
      })
      .reduce<RecordLink | null>(
        (best, l) => (best === null || rank(l) > rank(best) ? l : best),
        null,
      );
    if (chosen === null) {
      out.set(id, noLink(id));
      continue;
    }
    const base = {
      id,
      hop: node.hop,
      typeLabel: LINK_TYPE_LABELS[chosen.type],
      strength: chosen.strength,
      confirmed: chosen.confirmed,
    };
    if (chosen.strength === "implicit" && !chosen.confirmed) {
      out.set(id, {
        ...base,
        mode: "contribute",
        reason: "implicit_unconfirmed",
        quotes: [],
        carried: [],
      });
      continue;
    }
    const earlier = records.find((r) => r.id === chosen.fromId);
    out.set(id, {
      ...base,
      mode: "link",
      reason: "linked",
      quotes: [chosen.quoteFrom, chosen.quoteTo].filter(
        (q): q is string => !!q,
      ),
      carried: earlier === undefined ? [] : carriedWords(earlier),
    });
  }
  return out;
}

export type LinkTarget = {
  recordId: string;
  label: string;
  mode: SupportLinkState["mode"];
  carried: string[];
  /** 이 기록을 근거로 인용한 문장 id(본문 순서). */
  sentenceIds: string[];
  /** 처음 인용한 문장의 글. 인용한 문장이 없으면 null. */
  firstText: string | null;
};

/** 선택한 기록마다 본문이 어떤 문장에서 인용했는지 모은다(명세 No.182). */
export function linkTargets(
  states: SupportLinkState[],
  labels: ReadonlyMap<string, string>,
  sentences: Sentence[],
): LinkTarget[] {
  return states.map((st) => {
    const citing = sentences.filter((s) =>
      s.evidence.some((e) => e.refId === st.id),
    );
    return {
      recordId: st.id,
      label: labels.get(st.id) ?? st.id,
      mode: st.mode,
      carried: st.carried,
      sentenceIds: citing.map((s) => s.id),
      firstText: citing[0]?.text ?? null,
    };
  });
}

/** 모델이 판정할 대상: 연계 문장을 써야 하고 본문이 실제로 인용한 기록. */
export const judgedTargets = (targets: LinkTarget[]): LinkTarget[] =>
  targets.filter((t) => t.mode === "link" && t.sentenceIds.length > 0);

export type LinkJudgment = {
  recordId: string;
  linkShown: boolean;
  /** 그 기록 문장을 빼도 뒤 문장이 성립하면 true. */
  standsWithout: boolean;
};

/**
 * 연계 경고 목록을 만든다(명세 No.182, 190). 인용한 문장이 없는 기록은 미사용이고, 연계 문장을 써야 하는
 * 기록은 구체물 낱말(코드)과 모델 판정을 싣는다. 기여 항목으로만 쓴 기록은 쓰였으면 점검하지 않는다.
 */
export function buildLinkChecks(
  targets: LinkTarget[],
  judgments: LinkJudgment[],
): LinkCheck[] {
  return targets.flatMap((t): LinkCheck[] => {
    const base = { recordId: t.recordId, label: t.label };
    if (t.sentenceIds.length === 0) {
      return [
        {
          ...base,
          status: "unused",
          linkShown: null,
          concreteWordPresent: null,
          listingSuspect: null,
        },
      ];
    }
    if (t.mode !== "link") return [];
    const j = judgments.find((x) => x.recordId === t.recordId);
    const first = t.firstText ?? "";
    return [
      {
        ...base,
        status: "checked",
        linkShown: j?.linkShown ?? null,
        concreteWordPresent:
          t.carried.length === 0
            ? null
            : t.carried.some((w) => first.includes(w)),
        listingSuspect: j?.standsWithout ?? null,
      },
    ];
  });
}
