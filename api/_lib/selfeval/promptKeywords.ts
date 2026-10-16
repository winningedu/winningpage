// 학교 문항 전문에서 핵심 낱말을 뽑는다(§2 20). 프롬프트에 함께 넣고 "문항의 핵심 낱말이
// 본문에 반영되는가" 확인을 결정론 포함 검사로 덮어쓰는 데 쓴다.

import { extractKeywords, stripParticle } from "./text.js";

// 문항마다 거의 나오는 지시어. 핵심 낱말이 아니라서 뺀다.
const INSTRUCTION_WORDS = new Set([
  "서술하시오",
  "쓰시오",
  "활동",
  "내용",
  "자신",
  "것",
  "대해",
  "통해",
  "하시오",
  "작성",
]);

/** 2글자 이상 명사형 어절 중 빈도 내림차순, 동률은 등장 순으로 상위 limit 개. */
export function extractPromptKeywords(prompt: string, limit = 5): string[] {
  const candidates = extractKeywords(prompt).filter(
    (w) => !INSTRUCTION_WORDS.has(w),
  );
  const counts = new Map<string, number>(candidates.map((w) => [w, 0]));
  for (const token of prompt.match(/[가-힣]+/g) ?? []) {
    const stem = stripParticle(token);
    const c = counts.get(stem);
    if (c !== undefined) counts.set(stem, c + 1);
  }
  // Array.prototype.sort 는 안정 정렬이라 동률은 등장 순이 그대로 남는다.
  return candidates
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, limit);
}
