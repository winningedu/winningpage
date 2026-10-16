// 성장설계 학생 조사 24문항 정의와 검증, 병합, 답변 집계(명세 No.30, 35, 36, 142).
// 순수 함수만 다루며 DB와 네트워크에 의존하지 않는다.

export type SurveyKind =
  | "text"
  | "choice"
  | "multi"
  | "department"
  | "universities";

export interface SurveyQuestion {
  key: string;
  group: string;
  kind: SurveyKind;
  options?: readonly string[];
}

export interface SurveyPick {
  name: string;
  source?: "diagnosis" | "activity" | "manual" | "search";
  custom?: boolean;
}

export type SurveyValue = string | string[] | SurveyPick | SurveyPick[];
// null 값은 patch 에서 해당 문항 비우기를 뜻한다.
export type SurveyAnswers = Record<string, SurveyValue | null>;

const G1 = "최근에 있었던 일";
const G2 = "진로와 관심";
const G3 = "해본 것과 하고 싶은 것";
const G4 = "함께한 경험";
const G5 = "지금의 나와 여건";

export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  { key: "q1", group: G1, kind: "text" },
  { key: "q2", group: G1, kind: "text" },
  {
    key: "q3",
    group: G1,
    kind: "choice",
    options: ["미리 나눠서", "마지막에 몰아서", "둘 다", "상황에 따라 다름"],
  },
  {
    key: "q4",
    group: G1,
    kind: "choice",
    options: ["혼자", "함께", "둘 다", "상황에 따라 다름"],
  },
  {
    key: "q5",
    group: G2,
    kind: "choice",
    options: ["정해짐", "고민 중", "탐색 중"],
  },
  { key: "q6", group: G2, kind: "text" },
  { key: "q7", group: G2, kind: "text" },
  { key: "q8", group: G2, kind: "text" },
  { key: "q9", group: G2, kind: "text" },
  { key: "q10", group: G2, kind: "department" },
  { key: "q11", group: G2, kind: "universities" },
  { key: "q12", group: G3, kind: "text" },
  {
    key: "q13",
    group: G3,
    kind: "multi",
    options: [
      "글쓰기와 비평",
      "영상과 콘텐츠 제작",
      "설계와 만들기",
      "관찰과 인터뷰",
    ],
  },
  { key: "q14", group: G3, kind: "text" },
  { key: "q15", group: G3, kind: "text" },
  { key: "q16", group: G3, kind: "text" },
  { key: "q17", group: G4, kind: "text" },
  { key: "q18", group: G4, kind: "text" },
  { key: "q19", group: G4, kind: "text" },
  { key: "q20", group: G4, kind: "text" },
  { key: "q21", group: G5, kind: "text" },
  { key: "q22", group: G5, kind: "text" },
  {
    key: "q23",
    group: G5,
    kind: "choice",
    options: ["개설됨", "일부만", "개설 안 됨", "모름"],
  },
  {
    key: "q24",
    group: G5,
    kind: "choice",
    options: ["2시간 이하", "2시간에서 5시간", "5시간 이상", "모름"],
  },
];

const QUESTION_BY_KEY = new Map(SURVEY_QUESTIONS.map((q) => [q.key, q]));

export type SurveyPatchResult =
  | { ok: true; patch: SurveyAnswers }
  | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const TEXT_MAX = 2000;
const UNIVERSITY_MAX = 2;
const PICK_SOURCES = ["diagnosis", "activity", "manual", "search"];

function isPick(v: unknown): v is SurveyPick {
  if (!isPlainObject(v)) return false;
  if (typeof v.name !== "string" || v.name.trim() === "") return false;
  if (v.source !== undefined && !PICK_SOURCES.includes(v.source as string))
    return false;
  if (v.custom !== undefined && typeof v.custom !== "boolean") return false;
  return true;
}

// 형식이 맞으면 null, 아니면 실패 사유를 돌려준다.
function checkValue(q: SurveyQuestion, value: unknown): string | null {
  switch (q.kind) {
    case "text":
      if (typeof value !== "string") return "문자열이어야 합니다";
      return value.trim().length > TEXT_MAX
        ? `${TEXT_MAX}자 이하여야 합니다`
        : null;
    case "choice":
      return typeof value === "string" && q.options?.includes(value)
        ? null
        : "선택지에 없는 값입니다";
    case "multi": {
      if (!Array.isArray(value)) return "배열이어야 합니다";
      if (new Set(value).size !== value.length)
        return "중복 선택은 허용되지 않습니다";
      return value.every((v) => typeof v === "string" && q.options?.includes(v))
        ? null
        : "선택지에 없는 값이 있습니다";
    }
    case "department":
      return isPick(value) ? null : "학과 이름이 필요합니다";
    case "universities":
      if (!Array.isArray(value)) return "배열이어야 합니다";
      if (value.length > UNIVERSITY_MAX)
        return `대학은 최대 ${UNIVERSITY_MAX}개입니다`;
      return value.every(isPick) ? null : "대학 이름이 필요합니다";
  }
}

export function validateSurveyPatch(raw: unknown): SurveyPatchResult {
  if (!isPlainObject(raw))
    return { ok: false, reason: "조사 답변은 객체여야 합니다" };
  const patch: SurveyAnswers = {};
  for (const [key, value] of Object.entries(raw)) {
    const q = QUESTION_BY_KEY.get(key);
    if (!q) return { ok: false, reason: `알 수 없는 문항 키입니다: ${key}` };
    if (value !== null) {
      const reason = checkValue(q, value);
      if (reason) return { ok: false, reason: `${key}: ${reason}` };
    }
    patch[key] = value as SurveyValue | null;
  }
  return { ok: true, patch };
}

export function mergeSurveyAnswers(
  current: unknown,
  patch: SurveyAnswers,
): SurveyAnswers {
  const merged: SurveyAnswers = isPlainObject(current)
    ? { ...(current as SurveyAnswers) }
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

const SHORT_ANSWER_MIN = 10;

function isAnswered(q: SurveyQuestion, value: unknown): boolean {
  switch (q.kind) {
    case "text":
      return typeof value === "string" && value.trim() !== "";
    case "choice":
      return typeof value === "string" && q.options?.includes(value) === true;
    case "multi":
    case "universities":
      return Array.isArray(value) && value.length >= 1;
    case "department":
      return isPick(value);
  }
}

export function countAnswered(answers: unknown): {
  answered: number;
  total: 24;
} {
  const source = isPlainObject(answers) ? answers : {};
  const answered = SURVEY_QUESTIONS.filter((q) =>
    isAnswered(q, source[q.key]),
  ).length;
  return { answered, total: 24 };
}

// 세 번째 대학을 고르면 가장 먼저 고른 대학을 뺀다(No.30). 같은 이름은 무시한다.
export function pushUniversity(
  list: readonly SurveyPick[],
  item: SurveyPick,
): SurveyPick[] {
  if (list.some((u) => u.name === item.name)) return [...list];
  const kept =
    list.length >= UNIVERSITY_MAX
      ? list.slice(list.length - UNIVERSITY_MAX + 1)
      : list;
  return [...kept, item];
}

// 짧은 답 안내용이며 입력을 막지는 않는다(No.142).
export function isShortAnswer(text: string): boolean {
  return text.trim().length < SHORT_ANSWER_MIN;
}
