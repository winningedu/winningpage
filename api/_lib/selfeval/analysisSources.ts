// 11항목 분석 값의 출처 분류(명세 No.38, 42, 115, 116, §6 11).
// 모델 호출 없이 결정론으로 "기록에서 온 값인가, 학생이 쓴 값인가"를 가른다.

import { extractKeywords } from "./text.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  type FieldSource,
} from "./types.js";

const toText = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" ");
  return String(v);
};

/** 활동 기록 7항목(topic, concept, method, result, limitation, numbers, sources)을 한 문자열로 합친다. */
export function recordText(record: ActivityRecordLike): string {
  return [
    record.topic,
    record.concept,
    record.method,
    record.result,
    record.limitation,
    record.numbers,
    record.sources,
  ]
    .map(toText)
    .filter((s) => s !== "")
    .join(" ");
}

function classifyOne(value: string, haystack: string): FieldSource {
  if (value.trim() === "") return "empty";
  // 낱말이 하나라도 기록 안에 있으면 기록에서 가져온 값으로 본다. 완전 일치를 요구하면 모델의 다듬은 문장이 전부 student 가 된다.
  return extractKeywords(value).some((k) => haystack.includes(k))
    ? "record"
    : "student";
}

export function classifyFieldSources(
  values: Record<AnalysisField, string>,
  record: ActivityRecordLike,
): Record<AnalysisField, FieldSource> {
  const hay = recordText(record);
  const out = {} as Record<AnalysisField, FieldSource>;
  for (const f of ANALYSIS_FIELDS) out[f] = classifyOne(values[f], hay);
  return out;
}

export function emptyAnalysis(): Analysis {
  const values = {} as Record<AnalysisField, string>;
  const sources = {} as Record<AnalysisField, FieldSource>;
  for (const f of ANALYSIS_FIELDS) {
    values[f] = "";
    sources[f] = "empty";
  }
  return { values, sources, conflicts: [] };
}

/** 학생이 고친 항목만 다시 분류한다. 값이 그대로면 기존 출처를 지킨다. */
export function mergeStudentEdits(
  prev: Analysis,
  edits: Partial<Record<AnalysisField, string>>,
  record: ActivityRecordLike,
): Analysis {
  const hay = recordText(record);
  const values = { ...prev.values };
  const sources = { ...prev.sources };
  for (const f of ANALYSIS_FIELDS) {
    const next = edits[f];
    if (next === undefined || next === prev.values[f]) continue;
    values[f] = next;
    sources[f] = classifyOne(next, hay);
  }
  return { values, sources, conflicts: prev.conflicts };
}
