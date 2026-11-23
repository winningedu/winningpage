// 문장 근거(명세 No.145, No.85) 읽기. 순수 함수만 둔다.
// 저장된 옛 리포트의 근거는 {activityId, field} 단일 객체, {student:true}, null 이었다.
// 새 모양은 SentenceEvidence 배열이라, 읽는 길목마다 normalizeEvidence 로 같은 모양으로 맞춘다.

import {
  ANALYSIS_FIELDS,
  type AnalysisField,
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
