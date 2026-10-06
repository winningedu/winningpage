// 저장 확인 모달의 7항목 초기값(명세 No.43, 63). 서버 api/_lib/selfeval/promote.ts 와 같은 규칙으로
// 핵심 활동의 분석 값에서 뽑는다. 학생이 모달에서 고친 값이 최종으로 저장되므로, 원문에 없는 값을
// 지어내지 않는 결정론 규칙만 쓴다.
import {
  extractNumbers,
  splitSentences,
  stripParticle,
} from "@/lib/selfeval/text";
import type { PromotedRecord, SessionActivityView } from "@/lib/selfeval/types";

// 자료명으로 보는 명사 끝(계획서 §2 21).
const SOURCE_SUFFIXES = [
  "표",
  "자료",
  "데이터",
  "보고서",
  "논문",
  "그래프",
  "통계",
];
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

/** 모달 입력 상태. 줄 단위 항목(수치, 자료명)은 줄바꿈으로 이은 문자열로 편집한다. */
export type PromoteForm = {
  topic: string;
  concept: string;
  method: string;
  result: string;
  limitation: string;
  numbers: string;
  sources: string;
};

function sourcesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(QUOTED)) {
    const inner = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").trim();
    if (inner !== "") out.push(inner);
  }
  // 따옴표 안은 이미 담았으니 어절 검사에서 뺀다. 안 그러면 같은 자료가 두 번 잡힌다.
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

export function buildPromoteDraft(
  core: SessionActivityView,
  sessionActivityName: string | null,
): PromoteForm {
  const values = core.analysis?.values;
  const method = values?.method ?? "";
  const result = values?.result ?? "";
  const topic = core.record.topic?.trim() || sessionActivityName?.trim() || "";
  return {
    topic,
    concept: values?.concept ?? "",
    method,
    result,
    limitation: values?.limitation ?? "",
    numbers: splitSentences(result)
      .filter((s) => extractNumbers(s).length > 0)
      .join("\n"),
    sources: [...new Set([...sourcesIn(method), ...sourcesIn(result)])].join(
      "\n",
    ),
  };
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

export function toPromoted(form: PromoteForm): PromotedRecord {
  return {
    topic: form.topic.trim(),
    concept: form.concept.trim(),
    method: form.method.trim(),
    result: form.result.trim(),
    limitation: form.limitation.trim(),
    numbers: lines(form.numbers),
    sources: lines(form.sources),
  };
}
