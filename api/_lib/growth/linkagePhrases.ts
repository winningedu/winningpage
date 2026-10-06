// 성장설계 연계 표현 인식(명세 No.63).
// 선행 맥락(A) + 선행 행위(B) + 이번 적용(C) 세 그룹이 한 문장에 함께 나오면 연계로 본다.
// 축 일치(axis_match, 대주제 낱말 대조)는 이 모듈 범위가 아니다. 생성 단계에서 처리한다.

export type LinkageKind = "subject_link" | "grade_link";

export type LinkageResult = {
  linked: boolean;
  kind: LinkageKind | null;
  matched: { a: string | null; b: string | null; c: string | null };
};

/** A: 과목 신호. 과목명 사전 없이 "명사 + 에서" 를 본다. "이번 활동에서" 는 C 이므로 제외한다. */
export const LINKAGE_A_SUBJECT = /(?<!이번\s)(?!이번)[가-힣A-Za-z0-9ⅠⅡ]{2,}에서/i;

/** A: 학년 신호. 학년 간 연계는 호흡이 더 길어 과목 신호보다 우선한다. */
export const LINKAGE_A_GRADE = /[1-3]학년|(?:고|중)[1-3](?!\d)|작년|지난\s*학년|전\s*학년/i;

/** A: 학년·과목을 특정하지 않는 선행 맥락. 연계는 성립하지만 kind 는 null 이다. */
export const LINKAGE_A_OTHER = /앞서|이전에|지난|전\s*학기/i;

/** B: 선행 행위 */
export const LINKAGE_B = /학습한|배운|진행한|다룬|다뤘던|한\s*후|했던/i;

/** C: 이번 적용 */
export const LINKAGE_C =
  /이번에|이번\s*활동에서|연계하여|연계해|적용하여|적용해|이어서|확장하여|바탕으로/i;

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

export function detectLinkage(text: string): LinkageResult {
  const t = normalize(text);
  const grade = LINKAGE_A_GRADE.exec(t)?.[0] ?? null;
  const subject = LINKAGE_A_SUBJECT.exec(t)?.[0] ?? null;
  const other = LINKAGE_A_OTHER.exec(t)?.[0] ?? null;
  const a = grade ?? subject ?? other;
  const b = LINKAGE_B.exec(t)?.[0] ?? null;
  const c = LINKAGE_C.exec(t)?.[0] ?? null;
  const linked = a !== null && b !== null && c !== null;
  return {
    linked,
    kind: !linked ? null : grade !== null ? "grade_link" : subject !== null ? "subject_link" : null,
    matched: { a, b, c },
  };
}

/** 문장 경계: 마침표(소수점 제외)·물음표·느낌표·줄바꿈 */
const SENTENCE_SPLIT = /(?<!\d)\.(?!\d)|[?!。]|\n+/;

/** 연계로 인식된 문장만 반환한다(근거 표시용, No.84). */
export function extractLinkedSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map(normalize)
    .filter((s) => s !== "" && detectLinkage(s).linked);
}
