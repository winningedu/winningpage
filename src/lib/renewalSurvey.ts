/**
 * 무료진단 설문(리뉴얼) 파생 데이터 · 순수 술어 모음.
 *
 * renewalSurveyQuestions 는 정적 import 라 렌더마다 재계산할 이유가 없다.
 * 셸 / 스텝 페이지 / preview 가 각자 useMemo 를 갖는 중복을 원천 차단하기 위해
 * 모듈 최상위 상수로 승격한다.
 */
// 확장자 .js 명시 — verify 스크립트가 이 모듈(진행 판정 술어)을 plain node ESM 으로 직접 import 한다.
// node 는 Vite 와 달리 확장자 생략을 해석하지 못해 ERR_MODULE_NOT_FOUND 로 죽는다.

import {
  SURVEY_V3_PAGES,
  SURVEY_V3_QUESTIONS,
  statementsFor,
} from "@/data/diagnosisSurveyV3";
import { renewalSurveyQuestions } from "@/data/renewalSurveyQuestions.js";
import type { QuestionId, TrackCode } from "@/lib/diagnosis-v3/codes";
import { defaultQ4 } from "@/lib/diagnosis-v3/gradeConvert";
import { SCALE_ITEMS } from "@/lib/diagnosis-v3/likert";
import { OPTIONS, trackOf } from "@/lib/diagnosis-v3/options";
import type { AdmissionTarget, IsoDate } from "@/lib/diagnosis-v3/types";
import {
  EVENT_WINDOW_DAYS,
  isHidden,
  Q3_TARGET_ORDINALS,
  validateAnswers,
} from "@/lib/diagnosis-v3/validate";

// renewalSurveyQuestions.js는 타입 선언 없는 순수 JS 데이터 배열이라 문항 형태를 여기서
// 직접 규정한다(원본 데이터 파일은 이번 전환 대상이 아니라 손대지 않는다).
type SurveyExtra = {
  embeddedIn?: string;
  statements?: { key: string; text: string }[];
  placeholder?: string;
  dependsOn?: { questionId?: string };
  [key: string]: unknown;
};

type SurveyQuestion = {
  id: string;
  number: number | null;
  page: number;
  type: string;
  title: string;
  optional?: boolean;
  requiredFields?: string[];
  extra?: SurveyExtra;
  [key: string]: unknown;
};

type SurveyAnswers = Record<string, unknown>;

export const SURVEY_TOTAL_STEPS = 5;
// 설문 앱 라우트는 /app/{slug}/... 통일 규칙(App.jsx 154-156)에 마운트된다. 접두어를 빠뜨리면
// 어떤 라우트와도 매치되지 않아 catch-all(홈)로 튕기며 답변이 소실된다. 리포트(/learning-diagnosis/report)는
// 앱이 아니라 결과 문서라 /app 밖에 그대로 둔다.
export const SURVEY_FIRST_STEP_PATH = "/app/learning-diagnosis/survey/1";
export const SURVEY_REPORT_PATH = "/learning-diagnosis/report";

export function getStepPath(step: number | string) {
  return `/app/learning-diagnosis/survey/${step}`;
}

export const surveyMainQuestions: SurveyQuestion[] = (
  renewalSurveyQuestions as SurveyQuestion[]
)
  .filter((question) => question.number != null)
  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

export const surveyEmbeddedByParent: Record<string, SurveyQuestion[]> = (
  renewalSurveyQuestions as SurveyQuestion[]
)
  .filter((question) => question.extra?.embeddedIn)
  .reduce<Record<string, SurveyQuestion[]>>((map, question) => {
    const parentId = question.extra?.embeddedIn as string;
    if (!map[parentId]) map[parentId] = [];
    map[parentId].push(question);
    return map;
  }, {});

export function getStepQuestions(step: number) {
  return surveyMainQuestions.filter((question) => question.page === step);
}

// 다음 스텝 이후에 남아 있는 문항 수(응답 무관). 1→13, 2→11, 3→9, 4→5, 5→0
// (q5·q7 삭제로 17문항 · 분포 3/3/2/4/5 였던 것이, QA 행348(2026-09-02)로 q4 가 화면에서
// 빠지면서 16문항 · 분포 3/2/2/4/5 가 되었다 — 스텝1 값만 14 → 13 으로 바뀌고 나머지는
// page2 감소분이 총합 감소분과 상쇄되어 그대로다.)
export function getRemainingAfterStep(step: number) {
  return surveyMainQuestions.filter((question) => question.page > step).length;
}

/**
 * 진행(다음 스텝 이동) 요건에 들어가는 문항.
 * - 중첩 문항(number:null / extra.embeddedIn)은 surveyMainQuestions 단계에서 이미 제외된다.
 * - `optional: true` 로 표시된 선택입력 문항(q19 주관식)은 화면에는 나오지만 요건에서 뺀다.
 */
export function getStepRequiredQuestions(step: number) {
  return getStepQuestions(step).filter(
    (question) => question.optional !== true,
  );
}

function getStepUnansweredCount(step: number, answers?: SurveyAnswers) {
  return getStepRequiredQuestions(step).filter(
    (question) => !isQuestionAnswered(question, answers?.[question.id]),
  ).length;
}

export function isStepComplete(step: number, answers?: SurveyAnswers) {
  return getStepUnansweredCount(step, answers) === 0;
}

// '1'~'5' 만 통과. '01' · '1.0' · '1abc' · ' 1' 전부 거부.
export function parseStepParam(raw: string | null | undefined) {
  return /^[1-5]$/.test(raw ?? "") ? Number(raw) : null;
}

/**
 * 문항 단위 응답 판정 (§3.4 B-08).
 *
 * `isAnswered(type, value)` 는 grade-grid 를 그룹 단위로만 본다 — 모의고사 '국어' 한 칸만 채워도
 * true 라, 내신 전체 평균을 비운 채 스텝 2를 통과해 리포트까지 도달하는 경로가 열려 있었다
 * (naesinOverall = null → gpa '미입력' + 입결 표 0행). 문항이 `requiredFields` 를 선언하면
 * 그 칸들이 **전부** 채워졌을 때만 응답으로 친다.
 *
 * 진행 판정에는 반드시 이 함수를 쓴다. isAnswered 는 문항 메타를 못 보는 하위 술어라
 * 직접 부르면 requiredFields 선언이 조용히 무시된다.
 */
// 이 함수는 QuestionCardList.tsx/useUnansweredNavigation.ts 등 여러 화면이 각자 선언한
// "SurveyQuestion 비슷한" 지역 타입 객체를 그대로 넘겨 받는다(공유 타입 파일을 새로 만들지
// 않기로 한 작업 지시 때문에 그 타입들을 통일할 수 없다). 그래서 매개변수를 any로 받고
// 함수 본문은 원래부터 옵셔널 체이닝으로만 필드에 접근한다(런타임 동작 무변경).
export function isQuestionAnswered(question: any, value: unknown) {
  if (!isAnswered(question?.type, value)) return false;
  // Q-10 확정(2026-08-11) — 리커트는 12문장 전부 응답해야 통과한다(진행 게이트, 분모 산식은 무변경).
  // extra.statements 가 문장 키의 정본이라 개수를 여기서 재선언하지 않고 그대로 참조한다.
  if (question?.type === "likert")
    return (
      Object.keys((value as Record<string, unknown>) ?? {}).length >=
      (question.extra?.statements?.length ?? 0)
    );
  const required = question?.requiredFields;
  if (!Array.isArray(required) || required.length === 0) return true;
  return required.every(
    (key) =>
      (value as Record<string, unknown> | undefined)?.[key] !== "" &&
      (value as Record<string, unknown> | undefined)?.[key] != null,
  );
}

export function isAnswered(type: string | undefined, value: unknown) {
  if (value == null) return false;
  if (type === "checkbox-row") return Array.isArray(value) && value.length > 0;
  if (type === "likert")
    return typeof value === "object" && Object.keys(value).length > 0;
  if (type === "grade-grid") {
    return (
      typeof value === "object" &&
      Object.values(value as object).some(
        (field) => field !== "" && field != null,
      )
    );
  }
  if (type === "cascade") {
    return (
      typeof value === "object" &&
      Boolean((value as { university?: unknown }).university)
    );
  }
  return typeof value === "string" && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// v3 survey (score source 13_문항메타, 16_문항규칙)
// ---------------------------------------------------------------------------

/** Survey state while answering: v3 answer fields plus in-progress inputs. */
export type SurveyDraft = Readonly<Record<string, unknown>>;

/** Track of the q1 answer (14 TRACK codes); null before q1 is answered. */
export function draftTrack(draft: SurveyDraft): TrackCode | null {
  const grade = draft.q1;
  return OPTIONS.q1.some((option) => option.ordinal === grade)
    ? trackOf(grade as number)
    : null;
}

// 13 F27 연쇄선택 4단: university, department, type, detail.
const CASCADE_STEPS = [
  "university",
  "department",
  "admissionType",
  "detailType",
] as const;

/** q15 counts as entered once all four cascade steps are picked. */
export function isCascadeComplete(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return CASCADE_STEPS.every(
    (step) => typeof record[step] === "string" && record[step] !== "",
  );
}

/** 13 H7: q3 options 1..3 open the target university and major inputs. */
export function showsQ3Target(draft: SurveyDraft): boolean {
  return Q3_TARGET_ORDINALS.includes(draft.q3 as number);
}

/** Visible question ids of one screen, 13 H and 16 hiding rules. */
export function visibleQuestionIds(
  page: number,
  draft: SurveyDraft,
): QuestionId[] {
  const track = draftTrack(draft);
  // 13 H28-H30: q16..q18 open only when q15 is entered.
  const view: Record<string, unknown> = {
    ...draft,
    q15: isCascadeComplete(draft.q15) ? draft.q15 : undefined,
  };
  const visible: QuestionId[] = [];
  // Screen order puts a parent before its children, so a hidden parent's
  // value is cleared before its children are judged (q8s hides q8d).
  for (const question of SURVEY_V3_QUESTIONS) {
    if (isHidden(question.id, view, track)) {
      view[question.id] = undefined;
    } else if (question.page === page) {
      visible.push(question.id);
    }
  }
  return visible;
}

type Fields = Readonly<Record<string, unknown>>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (raw: unknown) =>
  typeof raw === "string" && raw.trim() !== "" ? Number(raw) : undefined;

/** Filled cells of a grade grid as numbers; undefined when none is filled. */
const filledGrades = (value: unknown) => {
  if (!isFields(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, raw]) => {
    const grade = toNumber(raw);
    return grade === undefined ? [] : [[key, grade] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const filledText = (value: unknown) => {
  if (!isFields(value)) return undefined;
  const entries = Object.entries(value).filter(
    ([, text]) => typeof text === "string" && text.trim() !== "",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const scheduleOf = (value: unknown) => {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return undefined;
  return value.map((row: Fields) => ({
    kind: row.kind,
    date: row.date,
    ...(typeof row.subject === "string" && row.subject.trim() !== ""
      ? { subject: row.subject.trim() }
      : {}),
  }));
};

const answerOf = (
  id: QuestionId,
  value: unknown,
  track: TrackCode | null,
  target: AdmissionTarget | null,
): unknown => {
  const question = SURVEY_V3_QUESTIONS.find((q) => q.id === id);
  switch (question?.kind) {
    case "multi":
      return Array.isArray(value) && value.length > 0 ? value : undefined;
    case "likert": {
      if (!isFields(value) || track === null) return undefined;
      const items = statementsFor(id as "q9" | "q11" | "q20" | "q23", track)
        .filter((statement) => statement.key !== "V")
        .map((statement) => value[statement.key]);
      return { items, verify: value.V };
    }
    case "number":
      return toNumber(value);
    case "grades":
      return filledGrades(value);
    case "mock": {
      const grades = isFields(value) ? filledGrades(value.grades) : undefined;
      return grades && isFields(value)
        ? { month: value.month, grades }
        : undefined;
    }
    case "schedule":
      return scheduleOf(value);
    case "cascade":
      return isCascadeComplete(value) && target ? target : undefined;
    default:
      return value;
  }
};

/**
 * Answers to send: visible questions only (hidden ones must be absent), in
 * the v3 contract shape. validateAnswers decides whether they are complete.
 */
export function toSubmitAnswers(
  draft: SurveyDraft,
  target: AdmissionTarget | null,
): Record<string, unknown> {
  const track = draftTrack(draft);
  const answers: Record<string, unknown> = {};
  for (let page = 1; page <= SURVEY_V3_PAGES; page++) {
    for (const id of visibleQuestionIds(page, draft)) {
      const value = answerOf(id, draft[id], track, target);
      if (value !== undefined) answers[id] = value;
    }
  }
  const goal = showsQ3Target(draft) ? filledText(draft.q3Target) : undefined;
  if (goal) answers.q3Target = goal;
  return answers;
}

/**
 * Questions on one screen that block the next screen, in screen order:
 * required ones left empty and any answer validateAnswers rejects (a half
 * filled schedule row, a date outside Day 1..42, an unfinished scale).
 */
export function screenProblems(
  page: number,
  draft: SurveyDraft,
  diagnosedAt: IsoDate,
): QuestionId[] {
  const result = validateAnswers(toSubmitAnswers(draft, null), diagnosedAt);
  if (result.ok) return [];
  const blocked = new Set<string>(
    result.errors
      // visibility is decided by visibleQuestionIds; q15 keys are resolved
      // only at submit, so q16..q18 read as hidden here
      .filter((error) => error.reason !== "hidden")
      .map((error) => (error.question === "q3Target" ? "q3" : error.question)),
  );
  return visibleQuestionIds(page, draft).filter((id) => blocked.has(id));
}

const DAY_MS = 86_400_000;

const addDays = (date: IsoDate, days: number): IsoDate =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** 16 r30, 06 C55: q13 dates from Day 1 (diagnosedAt) to Day 42. */
export function scheduleDateBounds(diagnosedAt: IsoDate) {
  return { min: diagnosedAt, max: addDays(diagnosedAt, EVENT_WINDOW_DAYS - 1) };
}

/** 32-bit FNV-1a hash of the seed text. */
const hashSeed = (seed: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
};

/** mulberry32: a small deterministic generator of [0, 1). */
const randomFrom = (seed: string) => {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Display order of q23 statement keys: items 1..35 shuffled by the seed,
 * the V4 check item always last (기능요구명세서 row 31, 17 B9).
 */
export function q23Order(seed: string): string[] {
  const random = randomFrom(seed);
  const keys = SCALE_ITEMS.q23.map((item) => String(item.no));
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [keys[i], keys[j]] = [keys[j] as string, keys[i] as string];
  }
  return [...keys, "V"];
}

/**
 * Draft after one answer. Picking q1 fills the q4 default (16 r19-r21, the
 * student can change it, 13 H9) and, when the track changes, clears the
 * track-specific q11 and q12 answers (기능요구명세서 row 5).
 */
export function applyAnswer(
  draft: SurveyDraft,
  id: string,
  value: unknown,
  diagnosedAt: IsoDate,
): SurveyDraft {
  const next: Record<string, unknown> = { ...draft, [id]: value };
  if (id !== "q1") return next;
  next.q4 = defaultQ4(value as number, diagnosedAt);
  if (draftTrack(draft) !== draftTrack(next)) {
    delete next.q11;
    delete next.q12;
  }
  return next;
}
