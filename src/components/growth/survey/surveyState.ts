// 학생 조사 화면의 순수 상태 로직. 네트워크와 DOM 에 의존하지 않는다.
//   - initialAnswers: 재진입 복원 또는 프리필 병합으로 초기 답을 만든다.
import type {
  SurveyAnswers,
  SurveyBootstrap,
  SurveyPick,
  SurveyQuestion,
  SurveyValue,
} from "@/lib/growth/api";

export const TEXT_MAX = 2000;
export const UNIVERSITY_MAX = 2;

/** 프리필 출처. 배지 문구는 PREFILL_BADGE 가 정한다. */
export type AnswerOrigin = "previous" | "diagnosis" | "activity";

export const PREFILL_BADGE: Readonly<Record<AnswerOrigin, string>> = {
  diagnosis: "무료진단에서 가져옴",
  previous: "지난 회차 답",
  activity: "저장된 활동에서 확인",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isPick(v: unknown): v is SurveyPick {
  return isRecord(v) && typeof v.name === "string" && v.name.trim() !== "";
}

/** 문항 형식에 맞는 값만 돌려주고, 아니면 undefined. 서버 검증과 같은 기준이다. */
export function sanitizeValue(
  q: SurveyQuestion,
  value: unknown,
): SurveyValue | undefined {
  switch (q.kind) {
    case "text":
      return typeof value === "string" && value.trim() !== ""
        ? value.slice(0, TEXT_MAX)
        : undefined;
    case "choice":
      return typeof value === "string" && q.options?.includes(value)
        ? value
        : undefined;
    case "multi": {
      if (!Array.isArray(value)) return undefined;
      const picked = [...new Set(value)].filter(
        (v): v is string => typeof v === "string" && !!q.options?.includes(v),
      );
      return picked.length > 0 ? picked : undefined;
    }
    case "department":
      return isPick(value) ? value : undefined;
    case "universities": {
      if (!Array.isArray(value)) return undefined;
      const picks = value.filter(isPick).slice(0, UNIVERSITY_MAX);
      return picks.length > 0 ? picks : undefined;
    }
  }
}

function sanitizeRecord(
  questions: readonly SurveyQuestion[],
  source: unknown,
): SurveyAnswers {
  if (!isRecord(source)) return {};
  const out: SurveyAnswers = {};
  for (const q of questions) {
    const v = sanitizeValue(q, source[q.key]);
    if (v !== undefined) out[q.key] = v;
  }
  return out;
}

export type InitialAnswers = {
  answers: SurveyAnswers;
  origins: Record<string, AnswerOrigin>;
};

type InitialInput = {
  questions: readonly SurveyQuestion[];
  openReport: Pick<
    NonNullable<SurveyBootstrap["openReport"]>,
    "answers"
  > | null;
  prefill: SurveyBootstrap["prefill"];
};

/**
 * 초기 답. 진행 중 회차에 저장된 답이 있으면 그대로 복원한다(No.144).
 * 없으면 이전 회차, 무료진단, 활동에서 확인된 값 순으로 비어 있는 키만 채운다(No.33, 34, 143).
 */
export function initialAnswers({
  questions,
  openReport,
  prefill,
}: InitialInput): InitialAnswers {
  const saved = sanitizeRecord(questions, openReport?.answers);
  if (Object.keys(saved).length > 0) return { answers: saved, origins: {} };

  const answers: SurveyAnswers = {};
  const origins: Record<string, AnswerOrigin> = {};
  const fill = (origin: AnswerOrigin, source: unknown) => {
    const clean = sanitizeRecord(questions, source);
    for (const [key, value] of Object.entries(clean)) {
      if (key in answers) continue;
      answers[key] = value;
      origins[key] = origin;
    }
  };

  fill("previous", prefill.previousAnswers);
  fill("diagnosis", prefill.survey);
  const { favoriteSubjects, books } = prefill.autoFilled;
  fill("activity", {
    q8: favoriteSubjects.length > 0 ? favoriteSubjects.join(", ") : undefined,
    q16: books.length > 0 ? books.join(", ") : undefined,
  });
  return { answers, origins };
}

// ── 답 상태 리듀서 ────────────────────────────────────────────────────
export type AnswersState = InitialAnswers;

export type AnswersAction = {
  type: "change";
  key: string;
  value: SurveyValue | null;
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** 값을 바꾸면 그 키의 프리필 배지를 걷는다. 비운 값은 null 로 저장해 서버가 키를 지우게 한다. */
export function answersReducer(
  state: AnswersState,
  action: AnswersAction,
): AnswersState {
  const { [action.key]: _removed, ...origins } = state.origins;
  return {
    answers: {
      ...state.answers,
      [action.key]: isEmptyValue(action.value) ? null : action.value,
    },
    origins,
  };
}

// ── 진행률 ────────────────────────────────────────────────────────────
function isAnswered(q: SurveyQuestion, value: unknown): boolean {
  return !isEmptyValue(value) && sanitizeValue(q, value) !== undefined;
}

export function countAnswered(
  questions: readonly SurveyQuestion[],
  answers: SurveyAnswers,
): { answered: number; total: number } {
  const answered = questions.filter((q) =>
    isAnswered(q, answers[q.key]),
  ).length;
  return { answered, total: questions.length };
}

/** 답이 없는 첫 문항의 번호(1부터). 모두 답했으면 null. */
export function firstUnansweredNumber(
  questions: readonly SurveyQuestion[],
  answers: SurveyAnswers,
): number | null {
  const index = questions.findIndex((q) => !isAnswered(q, answers[q.key]));
  return index === -1 ? null : index + 1;
}

// ── 짧은 답 ───────────────────────────────────────────────────────────
export const SHORT_ANSWER_MIN = 10;

/** 서술 답이 10자 미만이면 안내를 띄운다(No.142). 입력을 막지는 않고, 빈 입력은 안내하지 않는다. */
export function isShortAnswer(text: string): boolean {
  const length = text.trim().length;
  return length > 0 && length < SHORT_ANSWER_MIN;
}

// ── 저장 패치 ─────────────────────────────────────────────────────────
/** 저장본과 지금 답을 비교해 서버로 보낼 patch 를 만든다. 비운 키는 null 이다. */
export function diffAnswers(
  saved: SurveyAnswers,
  current: SurveyAnswers,
): SurveyAnswers {
  const patch: SurveyAnswers = {};
  const keys = new Set([...Object.keys(saved), ...Object.keys(current)]);
  for (const key of keys) {
    const before = saved[key];
    const after = current[key];
    const beforeEmpty = isEmptyValue(before);
    const afterEmpty = isEmptyValue(after);
    if (beforeEmpty && afterEmpty) continue;
    if (afterEmpty) {
      patch[key] = null;
      continue;
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      patch[key] = after as SurveyValue;
    }
  }
  return patch;
}
