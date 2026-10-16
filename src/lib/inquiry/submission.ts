// 작성본 8절의 글자 수, 자리표시자, 평가 전 검사(명세 No.71, 72, 77, 78, 129).
// api/_lib/inquiry/submission.ts 와 같은 입출력의 순수 함수 사본이다(src 에서 api/ 를 import 하지 않는다).
// submission.test.ts 가 서버 파일과 같은 결과인지 대조한다. 서버를 바꾸면 이 파일도 같이 바꾼다.
import type { SectionGroup, SectionId, SubmissionSections } from "./types";

/** 평가 최소 분량(Ⅰ~Ⅶ 합계, No.77). 서버 MIN_SUBMISSION_CHARS 와 같다. */
export const MIN_SUBMISSION_CHARS = 300;

export type SectionMeta = {
  id: SectionId;
  numeral: string;
  title: string;
  group: SectionGroup;
  /** 권장 분량(자). null 은 제한 없음. */
  recommendedChars: number | null;
  hint: string;
};

/** 8절 메타. 서버 SECTIONS 와 같다. */
export const SECTIONS: readonly SectionMeta[] = [
  {
    id: "I",
    numeral: "Ⅰ",
    title: "탐구 동기",
    group: "intro",
    recommendedChars: 300,
    hint: "출발 활동, 무엇이 걸렸는가, 왜 지금 이 질문인가",
  },
  {
    id: "II",
    numeral: "Ⅱ",
    title: "탐구 질문과 가설",
    group: "intro",
    recommendedChars: 150,
    hint: "질문 한 문장, 가설 1, 가설 2",
  },
  {
    id: "III",
    numeral: "Ⅲ",
    title: "탐구 방법",
    group: "body",
    recommendedChars: 300,
    hint: "자료 출처표, 자료 처리, 분석 도구",
  },
  {
    id: "IV",
    numeral: "Ⅳ",
    title: "탐구 결과",
    group: "body",
    recommendedChars: 300,
    hint: "확인한 값, 눈에 띄는 반례",
  },
  {
    id: "V",
    numeral: "Ⅴ",
    title: "해석",
    group: "body",
    recommendedChars: 400,
    hint: "가설 판정, 왜 그런가, 한 문장 정리, 처음 질문으로, 진로 연결",
  },
  {
    id: "VI",
    numeral: "Ⅵ",
    title: "한계",
    group: "conclusion",
    recommendedChars: 150,
    hint: "표본과 대표성, 상관과 인과, 자료 신뢰도",
  },
  {
    id: "VII",
    numeral: "Ⅶ",
    title: "후속 탐구",
    group: "conclusion",
    recommendedChars: 150,
    hint: "남은 질문, 다음에 할 것, 어느 활동에서 할지",
  },
  {
    id: "VIII",
    numeral: "Ⅷ",
    title: "참고 자료",
    group: "conclusion",
    recommendedChars: null,
    hint: "기관, 자료명, 기준 시점, 링크",
  },
];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** 최소 분량 합계에 들어가는 절(No.77): Ⅰ~Ⅶ. */
export const MIN_CHARS_SECTION_IDS: readonly SectionId[] = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
];

/** 대괄호 사이 1~40자, 줄바꿈 없음. 서버 PLACEHOLDER_RE 와 같다. */
export const PLACEHOLDER_RE = /\[[^[\]\r\n]{1,40}\]/g;

function recordOfSections<T>(pick: (id: SectionId) => T): Record<SectionId, T> {
  const out = {} as Record<SectionId, T>;
  for (const id of SECTION_IDS) out[id] = pick(id);
  return out;
}

/** 절별 글자 수. 공백을 포함하고 양끝 공백은 뺀다. */
export function countChars(
  sections: SubmissionSections,
): Record<SectionId, number> {
  return recordOfSections((id) => Array.from(sections[id].trim()).length);
}

/** 평가 최소 분량 합계(Ⅰ~Ⅶ, No.77). */
export function totalForMinimum(counts: Record<SectionId, number>): number {
  return MIN_CHARS_SECTION_IDS.reduce((sum, id) => sum + counts[id], 0);
}

/** 권장 분량 대비 부족분. 권장이 없으면 null, 넘으면 0(No.72). */
export function shortageOf(sectionId: SectionId, count: number): number | null {
  const recommended = SECTIONS.find(
    (s) => s.id === sectionId,
  )?.recommendedChars;
  if (recommended == null) return null;
  return Math.max(0, recommended - count);
}

/** 공백뿐인 절(8절 전부 검사, No.71). */
export function emptySections(sections: SubmissionSections): SectionId[] {
  return SECTION_IDS.filter((id) => sections[id].trim() === "");
}

/** 절별 자리표시자 개수. 0인 절은 키가 없다(No.78). */
export function countPlaceholders(
  sections: SubmissionSections,
): Partial<Record<SectionId, number>> {
  const out: Partial<Record<SectionId, number>> = {};
  for (const id of SECTION_IDS) {
    const n = sections[id].match(PLACEHOLDER_RE)?.length ?? 0;
    if (n > 0) out[id] = n;
  }
  return out;
}

/** 자리표시자를 지운 사본. */
export function stripPlaceholders(
  sections: SubmissionSections,
): SubmissionSections {
  return recordOfSections((id) => sections[id].replace(PLACEHOLDER_RE, ""));
}

export type EvaluationCheck =
  | {
      ok: true;
      counts: Record<SectionId, number>;
      strippedCounts: Record<SectionId, number>;
      placeholders: Partial<Record<SectionId, number>>;
    }
  | { ok: false; code: "SECTION_EMPTY"; sections: SectionId[] }
  | { ok: false; code: "SUBMISSION_TOO_SHORT"; total: number };

/** 평가 전 검사. 자리표시자를 뺀 본문으로 빈 절을 먼저, 그다음 최소 분량을 판정한다. */
export function checkSubmissionForEvaluation(
  sections: SubmissionSections,
): EvaluationCheck {
  const stripped = stripPlaceholders(sections);
  const empty = emptySections(stripped);
  if (empty.length > 0) {
    return { ok: false, code: "SECTION_EMPTY", sections: empty };
  }
  const strippedCounts = countChars(stripped);
  const total = totalForMinimum(strippedCounts);
  if (total < MIN_SUBMISSION_CHARS) {
    return { ok: false, code: "SUBMISSION_TOO_SHORT", total };
  }
  return {
    ok: true,
    counts: countChars(sections),
    strippedCounts,
    placeholders: countPlaceholders(sections),
  };
}

/** 외부 입력을 8절 작성본으로 정규화한다. 객체가 아니거나 문자열 아닌 값이 있으면 null. */
export function normalizeSections(input: unknown): SubmissionSections | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const out = {} as SubmissionSections;
  for (const id of SECTION_IDS) {
    const value = record[id];
    if (value === undefined) {
      out[id] = "";
    } else if (typeof value === "string") {
      out[id] = value;
    } else {
      return null;
    }
  }
  return out;
}
