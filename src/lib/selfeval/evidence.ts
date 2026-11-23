// 문장 근거 표시 도우미(명세 No.145, 147, 148). 서버가 정한 근거 배열을 번호와 칩으로 보여 줄 때 쓴다.

import { splitSentences } from "./text";
import {
  ANALYSIS_FIELD_LABELS,
  type GenerationSections,
  type Sentence,
  type SentenceEvidence,
} from "./types";

const CIRCLED_MAX = 20;
const CIRCLED_BASE = 0x2460;

/** 문장 번호. 1부터 20까지는 동그라미 숫자, 그 뒤는 (21) 처럼 괄호 숫자다. */
export function circledNumber(n: number): string {
  return n >= 1 && n <= CIRCLED_MAX
    ? String.fromCodePoint(CIRCLED_BASE + n - 1)
    : `(${n})`;
}

/** 확인이 필요한 문장(노란 표시)이다. 학생이 확인하면 풀린다. */
const needsConfirmation = (s: Sentence): boolean => s.feeling && !s.confirmed;

/** 근거가 1개 이상이고 확인 필요가 아닌 문장 수와 전체 문장 수. */
export function evidenceCompletion(sentences: Sentence[]): {
  linked: number;
  total: number;
} {
  return {
    linked: sentences.filter(
      (s) => s.evidence.length > 0 && !needsConfirmation(s),
    ).length,
    total: sentences.length,
  };
}

/**
 * 본문 전체의 문장 번호. 문장 나누기는 글자 수 점검(명세 No.56)과 같은 splitSentences 규칙이라,
 * 한 문장 글이 둘로 갈리면 다음 번호를 건너뛰어 점검 화면의 문장 수와 어긋나지 않게 한다.
 * 리포트 번호(api/_lib/selfeval/evidence.ts 의 sentenceSpan)가 같은 규칙이다. 한쪽을 바꾸면 같이 고친다.
 */
export function sentenceNumbers(
  sections: GenerationSections,
): Map<string, number> {
  const out = new Map<string, number>();
  let next = 1;
  for (const s of sections.paragraphs.flatMap((p) => p.sentences)) {
    out.set(s.id, next);
    next += Math.max(1, splitSentences(s.text).length);
  }
  return out;
}

/** 근거 칩 글자. 출처 유형 글자와 짧은 이름이다. */
export function chipLabel(e: SentenceEvidence): string {
  return e.item === "student_input"
    ? `${e.sourceType} 학생 입력`
    : `${e.sourceType} ${ANALYSIS_FIELD_LABELS[e.item]}`;
}
