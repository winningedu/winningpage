// 작성본 8절의 글자 수, 자리표시자, 평가 전 검사(명세 No.71, 72, 77, 78, 129). 순수 함수만 둔다.
import {
  MIN_CHARS_SECTION_IDS,
  MIN_SUBMISSION_CHARS,
  SECTIONS,
  SECTION_IDS,
} from "./constants.js";
import type { SectionId, SubmissionSections } from "./types.js";

/** 대괄호 사이 1~40자, 줄바꿈 없음(§6 5). 수식 대괄호 오탐은 감수한다. */
export const PLACEHOLDER_RE = /\[[^[\]\r\n]{1,40}\]/g;

function recordOfSections<T>(pick: (id: SectionId) => T): Record<SectionId, T> {
  const out = {} as Record<SectionId, T>;
  for (const id of SECTION_IDS) out[id] = pick(id);
  return out;
}

/** 절별 글자 수. 공백을 포함하고 양끝 공백은 뺀다. 서버가 다시 세는 값이다. */
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

/** 자리표시자를 지운 사본. 모델에 넘기는 판정 텍스트로 쓴다. */
export function stripPlaceholders(
  sections: SubmissionSections,
): SubmissionSections {
  return recordOfSections((id) => sections[id].replace(PLACEHOLDER_RE, ""));
}

export type EvaluationCheck =
  | {
      ok: true;
      /** 원문 기준 글자 수(화면 카운터용). */
      counts: Record<SectionId, number>;
      /** 자리표시자를 뺀 글자 수(판정용). */
      strippedCounts: Record<SectionId, number>;
      placeholders: Partial<Record<SectionId, number>>;
    }
  | { ok: false; code: "SECTION_EMPTY"; sections: SectionId[] }
  | { ok: false; code: "SUBMISSION_TOO_SHORT"; total: number };

/**
 * 평가 전 검사. 자리표시자를 뺀 본문으로 빈 절을 먼저, 그다음 최소 분량을 판정한다(No.71, 77, 78).
 * 자리표시자는 아직 쓰지 않은 것이므로 분량에 넣지 않는다.
 */
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
