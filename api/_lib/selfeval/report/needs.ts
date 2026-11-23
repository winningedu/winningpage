// 모델이 써야 하는 문장 목록(명세 No.137, 153). 항목마다 근거 원문(sources), 쓸 수 있는 꼬리표와
// 문장 번호, 직접 인용 상한을 함께 둬서 사실 대조가 같은 목록을 쓴다.

import type {
  ReportCh03,
  ReportCh04,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { ReadBody } from "./body.js";
import type { Ch02Result } from "./ch02.js";
import type { NextStepCandidate } from "./ch05.js";
import { circled } from "./copy.js";
import type { BuildInput, ReportRecord } from "./inputs.js";

export type NeedKind =
  | "summary"
  | "reason"
  | "relation"
  | "memo"
  | "memoReason"
  | "memoRate"
  | "next";

export type ComposeNeed = {
  id: string;
  kind: NeedKind;
  /** 모델에게 보이는 지시 한 줄. */
  instruction: string;
  /** 대조 기준이 되는 원문. 숫자와 인용은 이 안에 있어야 한다. */
  sources: string[];
  allowedTags: string[];
  /** 문장 번호(①)로 가리킬 수 있는 번호. */
  allowedNumbers: number[];
  /** 직접 인용 상한(글자). 기록 인용 30자, 관계 설명 인용 15자. */
  maxQuote: number;
  requiredTag?: string;
};

export const RECORD_QUOTE_MAX = 30;
export const RELATION_QUOTE_MAX = 15;

const toText = (v: unknown): string =>
  v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v);

export function recordSource(r: ReportRecord): string {
  return [
    r.topic,
    r.concept,
    r.method,
    r.result,
    r.limitation,
    r.numbers,
    r.sources,
    r.summary,
    r.reflection,
  ]
    .map(toText)
    .filter((s) => s !== "")
    .join(" ");
}

export function buildNeeds(
  input: BuildInput,
  body: ReadBody,
  ch02: Ch02Result,
  ch03: ReportCh03,
  ch04: ReportCh04 | null,
  candidates: NextStepCandidate[],
): ComposeNeed[] {
  const out: ComposeNeed[] = [];
  const memoById = new Map(input.memos.map((m) => [m.id, m]));
  const sentencesOf = (id: string) =>
    body.sentences.filter((s) => s.refs.some((r) => r.refId === id));
  const tagsIn = (id: string) => {
    const tags = new Set<string>();
    for (const s of sentencesOf(id)) {
      for (const r of s.refs) {
        const t = ch02.tagOf(r.refId);
        if (t !== null) tags.add(t);
      }
    }
    return tags;
  };
  const sentenceLines = (id: string) =>
    sentencesOf(id).map((s) => `${circled(s.n)} ${s.text}`);
  const numbersOf = (id: string) => sentencesOf(id).map((s) => s.n);
  const sourcesOfTag = (tag: string): string[] => {
    const id = ch02.tagMap[tag];
    if (id === undefined) return [];
    const memo = memoById.get(id);
    if (memo !== undefined) return [memo.text, ...sentenceLines(id)];
    const info = ch02.info.get(id);
    return info === undefined
      ? []
      : [recordSource(info.record), ...sentenceLines(id)];
  };
  const rows = ch02.ch02.subjects.flatMap((s) => s.rows);

  // 기록 요약(02장). 기록에 요약이 없을 때만 모델이 쓴다.
  for (const row of rows) {
    const info = ch02.info.get(row.recordId);
    if (info === undefined || info.record.summary !== null) continue;
    const src = recordSource(info.record);
    if (src === "") continue;
    out.push({
      id: `summary:${row.tag}`,
      kind: "summary",
      instruction: `${row.tag} 기록을 1~2줄로 요약한다. 기록에 있는 내용만 쓴다.`,
      sources: [src],
      allowedTags: [row.tag],
      allowedNumbers: [],
      maxQuote: RECORD_QUOTE_MAX,
    });
  }
  // 미반영 이유(02장).
  for (const row of rows) {
    if (row.role !== "unreflected") continue;
    const info = ch02.info.get(row.recordId);
    if (info === undefined) continue;
    out.push({
      id: `reason:${row.tag}`,
      kind: "reason",
      instruction: `${row.tag} 기록이 이번 자기평가에 쓰이지 않은 이유(${row.reasonLabel ?? ""})를 한 문장으로 쓴다.`,
      sources: [recordSource(info.record)],
      allowedTags: [row.tag],
      allowedNumbers: [],
      maxQuote: RECORD_QUOTE_MAX,
    });
  }
  // 관계 설명(03장).
  for (const row of ch03.rows) {
    out.push({
      id: `relation:${row.tag}`,
      kind: "relation",
      instruction: `${row.tag} 기록과 자기평가의 관계(${row.relationLabel})를 1~2문장으로 설명한다. 관계 이름은 바꾸지 않는다. 문장 번호와 15자 이내 직접 인용을 쓸 수 있다.`,
      sources: sourcesOfTag(row.tag),
      allowedTags: [...new Set([row.tag, ...tagsIn(row.recordId)])],
      allowedNumbers: numbersOf(row.recordId),
      maxQuote: RELATION_QUOTE_MAX,
    });
  }
  // 수기 연결 설명과 미반영 이유(04장).
  if (ch04 !== null) {
    for (const row of ch04.rows) {
      out.push({
        id: row.reflected ? `memo:${row.tag}` : `memoReason:${row.tag}`,
        kind: row.reflected ? "memo" : "memoReason",
        instruction: row.reflected
          ? `${row.tag} 메모가 자기평가의 어느 문장과 어떻게 이어지는지 1~2줄로 설명한다.`
          : `${row.tag} 메모가 이번 자기평가에 쓰이지 않은 이유를 한 문장으로 쓴다.`,
        sources: [row.text, ...sentenceLines(row.logId)],
        allowedTags: [...new Set([row.tag, ...tagsIn(row.logId)])],
        allowedNumbers: row.sentenceNumbers,
        maxQuote: RECORD_QUOTE_MAX,
      });
    }
    if (ch04.reflectedCount > 0) {
      out.push({
        id: "memoRate",
        kind: "memoRate",
        instruction: `수기 반영률 요약 틀 뒤에 붙일 한 문장을 쓴다. 틀은 코드가 쓰므로 반복하지 않는다. 틀: ${ch04.summary}`,
        sources: [
          ...ch04.rows.map((r) => r.text),
          `${ch04.sentenceTotal} ${ch04.sentenceNumbers.length} ${ch04.reflectedCount} ${ch04.totalCount}`,
        ],
        allowedTags: ch04.rows.map((r) => r.tag),
        allowedNumbers: ch04.sentenceNumbers,
        maxQuote: RECORD_QUOTE_MAX,
      });
    }
  }
  // 다음 단계 제안(05장).
  for (const c of candidates) {
    const id = ch02.tagMap[c.tag];
    out.push({
      id: `next:${c.key}`,
      kind: "next",
      instruction: `다음 단계 제안 한 문장을 쓴다. 근거 꼬리표 ${c.tag}를 문장에 반드시 적고, 기록에 없는 행동을 권하지 않는다.`,
      sources: [
        ...sourcesOfTag(c.tag),
        ...(c.improvement === undefined ? [] : [c.improvement]),
      ],
      allowedTags: [
        ...new Set([c.tag, ...(id === undefined ? [] : tagsIn(id))]),
      ],
      allowedNumbers: id === undefined ? [] : numbersOf(id),
      maxQuote: RECORD_QUOTE_MAX,
      requiredTag: c.tag,
    });
  }
  return out;
}
