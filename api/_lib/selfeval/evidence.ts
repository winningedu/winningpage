// 문장 근거(명세 No.145, No.85) 읽기. 순수 함수만 둔다.
// 저장된 옛 리포트의 근거는 {activityId, field} 단일 객체, {student:true}, null 이었다.
// 새 모양은 SentenceEvidence 배열이라, 읽는 길목마다 normalizeEvidence 로 같은 모양으로 맞춘다.

import { extractNumbers } from "./text.js";
import {
  ANALYSIS_FIELDS,
  type AnalysisField,
  BODY_EVIDENCE_FIELDS,
  type EvidenceItem,
  type EvidenceSourceType,
  type EvidenceWeight,
  type SentenceEvidence,
} from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const SOURCE_TYPES: readonly EvidenceSourceType[] = ["P", "D", "A", "H", "S"];
const WEIGHTS: readonly EvidenceWeight[] = ["main", "sub"];

/** 기록 id 로 출처 유형을 찾는 함수. 모르는 기록이면 null. */
export type SourceTypeOf = (activityId: string) => EvidenceSourceType | null;

const STUDENT_EVIDENCE: SentenceEvidence = {
  sourceType: "S",
  refId: null,
  item: "student_input",
  weight: "main",
};

export function studentEvidence(): SentenceEvidence {
  return { ...STUDENT_EVIDENCE };
}

function readNew(raw: Record<string, unknown>): SentenceEvidence | null {
  const { sourceType, refId, item, weight } = raw;
  if (!SOURCE_TYPES.includes(sourceType as EvidenceSourceType)) return null;
  if (!WEIGHTS.includes(weight as EvidenceWeight)) return null;
  const itemOk =
    item === "student_input" ||
    (ANALYSIS_FIELDS as readonly string[]).includes(item as string);
  if (!itemOk) return null;
  if (sourceType === "S") return studentEvidence();
  if (typeof refId !== "string" || refId === "") return null;
  return {
    sourceType: sourceType as EvidenceSourceType,
    refId,
    item: item as EvidenceItem,
    weight: weight as EvidenceWeight,
  };
}

/**
 * 저장된 근거를 배열로 읽는다. 옛 모양은 이렇게 옮긴다.
 *   {activityId, field}  기록 한 건. 출처 유형은 typeOf 로 찾고, 못 찾으면 그 근거는 버린다.
 *                        typeOf 를 넘기지 않은 읽기는 수행평가(P)로 둔다(문장 자체는 그대로 보인다).
 *   {student: true}      S 근거
 *   null                 빈 배열
 */
export function normalizeEvidence(
  raw: unknown,
  typeOf?: SourceTypeOf,
): SentenceEvidence[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((e) => {
      const one = isRecord(e) ? readNew(e) : null;
      return one === null ? [] : [one];
    });
  }
  if (!isRecord(raw)) return [];
  if (raw.student === true) return [studentEvidence()];
  const { activityId, field } = raw;
  if (
    typeof activityId !== "string" ||
    !(ANALYSIS_FIELDS as readonly string[]).includes(field as string)
  ) {
    return [];
  }
  const sourceType = typeOf === undefined ? "P" : typeOf(activityId);
  if (sourceType === null) return [];
  return [
    {
      sourceType,
      refId: activityId,
      item: field as AnalysisField,
      weight: "main",
    },
  ];
}

/** 본문 jsonb 의 모든 문장 근거를 배열로 맞춘다. 본문 모양이 아니면 그대로 돌려준다. */
export function normalizeSections(
  raw: unknown,
  typeOf?: SourceTypeOf,
): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.paragraphs)) return raw;
  return {
    ...raw,
    paragraphs: raw.paragraphs.map((p) => {
      if (!isRecord(p) || !Array.isArray(p.sentences)) return p;
      return {
        ...p,
        sentences: p.sentences.map((s) =>
          isRecord(s)
            ? { ...s, evidence: normalizeEvidence(s.evidence, typeOf) }
            : s,
        ),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// 모델이 제안한 근거를 서버가 거른다(명세 No.145, 48, 199, 80, 200, 5, 161)
// ---------------------------------------------------------------------------

/** 이번 세션에서 근거가 될 수 있는 기록 하나. P, D, A 구분은 sourceTypeOfRecord 가 정한다. */
export type RecordEvidenceSource = {
  id: string;
  sourceType: "P" | "D" | "A";
  /** record_status 가 completed 인 기록만 근거가 된다(명세 No.200). */
  completed: boolean;
  /** 값이 있는 항목의 글. 비운 항목은 넣지 않는다. */
  itemTexts: Partial<Record<AnalysisField, string>>;
};

/** 학생이 확인했고 포함으로 둔 수기 메모(명세 No.161). */
export type MemoEvidenceSource = {
  id: string;
  text: string;
  /** 소속 기록 id. 정하지 못했으면 null(명세 No.188). */
  belongsTo: string | null;
};

export type EvidenceSources = {
  records: RecordEvidenceSource[];
  memos: MemoEvidenceSource[];
};

/** 소속 기록이 있는 수기 메모가 근거가 될 수 있는 항목: 계기, 한 일, 방법, 한계(명세 No.161, 188). */
export const MEMO_EVIDENCE_ITEMS: readonly AnalysisField[] = [
  "motive",
  "action",
  "method",
  "limitation",
];

/** 소속 기록이 없는 수기 메모는 계기 항목의 단독 근거로만 쓴다(명세 No.188). */
export const UNOWNED_MEMO_EVIDENCE_ITEMS: readonly AnalysisField[] = ["motive"];

const numberCore = (token: string): string =>
  (token.match(/^[\d,.]+/)?.[0] ?? token).replace(/,/g, "");

const numberSet = (text: string): Set<string> =>
  new Set(extractNumbers(text).map(numberCore));

export type ResolvedEvidence = {
  evidence: SentenceEvidence[];
  /** 서버가 정한 확인 필요 여부. 모델 신고는 보지 않는다. */
  needsConfirmation: boolean;
};

/**
 * 모델이 문장마다 낸 근거 후보(refId, item, weight)를 이번 세션의 선택 기록과 포함된 수기 메모로
 * 거른다. 범위 밖 근거와 빈 항목은 조용히 버린다(명세 No.145). 다음으로 확인 필요를 서버가 정한다.
 *   근거가 하나도 남지 않음(명세 No.48, 199)
 *   완료되지 않은 기록을 가리킨 근거가 있었음(명세 No.200)
 *   문장 속 수치가 인용한 근거의 글에 없음(명세 No.5, 161): 수기 메모만으로 결과 수치를 만들지 못하게
 *     하려고, 근거 글(기록 항목 글과 수기 메모 글)에 같은 수가 없으면 올린다.
 * 가장 비슷한 기록을 대신 붙이는 일은 하지 않는다(명세 No.199).
 */
export function resolveSentenceEvidence(
  raw: unknown,
  text: string,
  sources: EvidenceSources,
): ResolvedEvidence {
  const kept: SentenceEvidence[] = [];
  const citedTexts: string[] = [];
  let droppedInProgress = false;
  const list = Array.isArray(raw) ? raw : [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const { refId, item } = entry;
    if (typeof refId !== "string" || typeof item !== "string") continue;
    if (!(BODY_EVIDENCE_FIELDS as readonly string[]).includes(item)) continue;
    const field = item as AnalysisField;
    const weight: EvidenceWeight = entry.weight === "main" ? "main" : "sub";
    const record = sources.records.find((r) => r.id === refId);
    const memo = sources.memos.find((m) => m.id === refId);
    let cited: SentenceEvidence | null = null;
    let citedText = "";
    if (record !== undefined) {
      const itemText = record.itemTexts[field]?.trim() ?? "";
      if (itemText === "") continue;
      if (!record.completed) {
        droppedInProgress = true;
        continue;
      }
      cited = { sourceType: record.sourceType, refId, item: field, weight };
      citedText = itemText;
    } else if (memo !== undefined) {
      const allowed =
        memo.belongsTo === null
          ? UNOWNED_MEMO_EVIDENCE_ITEMS
          : MEMO_EVIDENCE_ITEMS;
      if (!allowed.includes(field)) continue;
      cited = { sourceType: "H", refId, item: field, weight };
      citedText = memo.text;
    }
    if (cited === null) continue;
    if (kept.some((k) => k.refId === refId && k.item === field)) continue;
    kept.push(cited);
    citedTexts.push(citedText);
  }
  const known = new Set(citedTexts.flatMap((t) => [...numberSet(t)]));
  const unexplained = [...numberSet(text)].some((n) => !known.has(n));
  return {
    evidence: kept,
    needsConfirmation: kept.length === 0 || droppedInProgress || unexplained,
  };
}
