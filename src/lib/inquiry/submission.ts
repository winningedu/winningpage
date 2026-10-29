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
  /** 입력란 위에 보여주는 가상 작성 예시(2~3줄). 서버 SECTIONS 와 같다. */
  example: string;
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
    example:
      "[예시] 체육 시간에 친구마다 맥박이 뛰는 속도가 달랐습니다. 운동 강도가 심박수에 어떻게 영향을 주는지 궁금해졌고, 보건 수업의 순환계 단원과 이어서 탐구하기로 했습니다.",
  },
  {
    id: "II",
    numeral: "Ⅱ",
    title: "탐구 질문과 가설",
    group: "intro",
    recommendedChars: 150,
    hint: "질문 한 문장, 가설 1, 가설 2",
    example:
      "[예시] 질문: 운동 강도가 커지면 심박수는 얼마나 올라가는가? 가설 1: 강도에 비례해 오른다. 가설 2: 일정 강도 이후에는 오름세가 줄어든다.",
  },
  {
    id: "III",
    numeral: "Ⅲ",
    title: "탐구 방법",
    group: "body",
    recommendedChars: 300,
    hint: "자료 출처표, 자료 처리, 분석 도구",
    example:
      "[예시] 학생 5명이 제자리 걷기, 가볍게 뛰기, 전력 달리기를 한 뒤 손목 맥박을 1분간 3회씩 쟀습니다. 출처는 직접 측정이고, 평균을 구해 표로 정리했습니다.",
  },
  {
    id: "IV",
    numeral: "Ⅳ",
    title: "탐구 결과",
    group: "body",
    recommendedChars: 300,
    hint: "확인한 값, 눈에 띄는 반례",
    example:
      "[예시] 평균 심박수는 걷기 85회, 가볍게 뛰기 120회, 전력 달리기 160회였습니다. 다만 한 학생은 전력 달리기에서 130회로 다른 친구보다 훨씬 낮았습니다.",
  },
  {
    id: "V",
    numeral: "Ⅴ",
    title: "해석",
    group: "body",
    recommendedChars: 400,
    hint: "가설 판정, 왜 그런가, 한 문장 정리, 처음 질문으로, 진로 연결",
    example:
      "[예시] 강도에 따라 심박수가 오르므로 가설 1은 맞았습니다. 근육이 산소를 더 쓰기 때문으로 보이며, 운동처방사가 되고 싶은 제 진로와도 이어집니다.",
  },
  {
    id: "VI",
    numeral: "Ⅵ",
    title: "한계",
    group: "conclusion",
    recommendedChars: 150,
    hint: "표본과 대표성, 상관과 인과, 자료 신뢰도",
    example:
      "[예시] 측정 인원이 5명뿐이라 전체 학생을 대표하기 어렵습니다. 또 운동 강도와 심박수가 함께 오른다고 해서 강도만이 원인이라고 단정할 수 없습니다.",
  },
  {
    id: "VII",
    numeral: "Ⅶ",
    title: "후속 탐구",
    group: "conclusion",
    recommendedChars: 150,
    hint: "남은 질문, 다음에 할 것, 어느 활동에서 할지",
    example:
      "[예시] 평소 운동량이 다른 학생끼리 나누어 비교하고 싶습니다. 다음 학기 보건 동아리 활동에서 학년 전체를 대상으로 측정 인원을 늘려 다시 해 보겠습니다.",
  },
  {
    id: "VIII",
    numeral: "Ⅷ",
    title: "참고 자료",
    group: "conclusion",
    recommendedChars: null,
    hint: "기관, 자료명, 기준 시점, 링크",
    example:
      "[예시] 질병관리청, 국민건강영양조사 심박수 자료, 2023년 자료, https://www.kdca.go.kr. 대한심장학회 누리집 심박수 안내 글, 2024년 3월 확인.",
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
