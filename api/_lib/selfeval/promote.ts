// 확정한 분석을 활동 기록 7항목으로 승격한다(명세 No.43). 모델 호출 없이 결정론으로만
// 뽑고, 학생이 확인한 뒤 저장한다. 원문에 없는 값을 지어내지 않으려는 규칙이다.

import { SOURCE_SUFFIXES } from "./dictionaries.js";
import { extractNumbers, splitSentences, stripParticle } from "./text.js";
import type { Analysis, PromotedRecord } from "./types.js";

// "표" 로 끝나지만 자료가 아닌 흔한 낱말. 접미 규칙이 근사치라서 오탐을 따로 거른다.
const NOT_SOURCE_WORDS = new Set([
  "발표",
  "대표",
  "목표",
  "투표",
  "공표",
  "표",
]);

const QUOTED = /"([^"]+)"|'([^']+)'|「([^」]+)」|『([^』]+)』|“([^”]+)”/g;

function sourcesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(QUOTED)) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").trim();
    if (inner !== "") out.push(inner);
  }

  // 따옴표 안은 이미 통째로 담았으니 어절 검사에서 뺀다. 안 그러면 같은 자료가 두 번 잡힌다.
  const rest = text.replace(QUOTED, " ");
  for (const raw of rest.split(/\s+/)) {
    const word = raw.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9]+$/g, "");
    if (word === "") continue;
    const stem = SOURCE_SUFFIXES.some((s) => word.endsWith(s))
      ? word
      : stripParticle(word);
    if (NOT_SOURCE_WORDS.has(stem)) continue;
    if (SOURCE_SUFFIXES.some((s) => stem.endsWith(s))) out.push(stem);
  }
  return out;
}

export function promoteToRecord(
  analysis: Analysis,
  activityName: string,
): PromotedRecord {
  const { method, result, concept, limitation } = analysis.values;
  const sources = [...new Set([...sourcesIn(method), ...sourcesIn(result)])];
  return {
    topic: activityName,
    concept,
    method,
    result,
    limitation,
    numbers: splitSentences(result).filter((s) => extractNumbers(s).length > 0),
    sources,
  };
}
