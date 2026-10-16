// 회상 인터뷰 빈틈 후보 규칙(명세 No.34, 35, 초안 No.49 표). 모델을 부르지 않는 순수 함수다.
import type { GapCandidate, InterviewAnswers } from "./types.js";

const hasText = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim() !== "";

/** 문항 번호별 (source, text) 후보를 규칙 순서대로 모은다. */
function rawCandidates(
  answers: InterviewAnswers,
): { source: number; text: string }[] {
  const out: { source: number; text: string }[] = [];
  const add = (source: number, ...texts: string[]) => {
    for (const text of texts) out.push({ source, text });
  };

  const sources = answers.q3 ?? [];
  if (sources.includes("internet")) add(3, "원 출처를 확인하지 않고 인용함");
  if (sources.length > 0 && sources.every((s) => s === "textbook")) {
    add(3, "실제 사례나 데이터로 확인하지 못함");
  }
  if (sources.includes("paper")) add(3, "표본 수와 설계를 따지지 않음");
  if (sources.includes("measurement")) {
    add(3, "반복하지 않아 재현성을 확인하지 못함", "조건을 통제하지 못함");
  }

  if (hasText(answers.q4)) {
    add(
      4,
      "그 기준이 원래 어떤 목적과 대상을 위한 것인지 확인하지 않음",
      "내 대상에 적용되는지 따지지 않음",
    );
  }

  if (answers.q5 === "summary") add(5, "자기 해석을 붙이지 못함");
  if (answers.q5 === "claim") add(5, "틀릴 가능성을 검토하지 않음");

  if (hasText(answers.q6)) add(6, answers.q6.trim());
  if (hasText(answers.q7)) add(7, answers.q7.trim());
  return out;
}

/** 답변에서 빈틈 후보를 만든다. id 는 "g{문항}-{순번}" 으로 결정적이고 text 중복은 제거한다. */
export function gapCandidates(answers: InterviewAnswers): GapCandidate[] {
  const seen = new Set<string>();
  const counters = new Map<number, number>();
  const result: GapCandidate[] = [];
  for (const { source, text } of rawCandidates(answers)) {
    if (seen.has(text)) continue;
    seen.add(text);
    const n = (counters.get(source) ?? 0) + 1;
    counters.set(source, n);
    result.push({ id: `g${source}-${n}`, text, source });
  }
  return result;
}

export type InterviewValidation =
  | { ok: true }
  | { ok: false; code: "Q1_REQUIRED" | "GAPS_REQUIRED" };

/** 1번 필수, 빈틈 1개 이상 선택(No.35). 선택 0개면 저장하지 않는다. */
export function validateInterview(
  answers: InterviewAnswers,
  selectedGaps: string[],
): InterviewValidation {
  if (!hasText(answers.q1)) return { ok: false, code: "Q1_REQUIRED" };
  if (!selectedGaps.some((gap) => hasText(gap))) {
    return { ok: false, code: "GAPS_REQUIRED" };
  }
  return { ok: true };
}
