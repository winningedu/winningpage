// Answer checks shared by the survey and the server: required questions
// (13_문항메타 G), option ranges, visibility (13 H, 16), max picks, exclusive
// options (16 r22-r26) and the q13 date window (06 r55, judge-report R11).

import {
  QUESTION_IDS,
  type QuestionId,
  REQUIRED_QUESTIONS,
  type TrackCode,
} from "./codes.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS, type OptionRow, trackOf } from "./options.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import {
  ACHIEVEMENT_Q4,
  MIDDLE_SUBJECT_CODES,
  middleAverage,
} from "./subjects.js";
import type { DiagnosisV3Answers, IsoDate } from "./types.js";

export type ValidationError = {
  /** "unknown": a key that is no 13_문항메타 question (reported once, name not echoed) */
  readonly question: QuestionId | "q3Target" | "unknown";
  readonly reason: "missing" | "invalid" | "hidden" | "too_many";
};

export type ValidationResult =
  | { readonly ok: true; readonly answers: DiagnosisV3Answers }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

type Raw = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Review W1: a record may carry only the listed own keys. */
const hasOnlyKeys = (value: Raw, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/**
 * Free-text length cap (review W1). No sheet cell names a length for the q3
 * target inputs (13 H7) or the q13 subject; this is an abuse guard only, listed
 * as a spec gap in the report.
 */
export const MAX_TEXT_LENGTH = 100;
const isShortText = (value: unknown) =>
  typeof value === "string" && value.length <= MAX_TEXT_LENGTH;

const isOrdinalOf = (rows: readonly OptionRow[], value: unknown) =>
  rows.some((option) => option.ordinal === value);

const isLikert = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4;

const isLikertBlock = (value: unknown, size: number) =>
  isRecord(value) &&
  hasOnlyKeys(value, ["items", "verify"]) &&
  Array.isArray(value.items) &&
  value.items.length === size &&
  value.items.every(isLikert) &&
  isLikert(value.verify);

const labelOfQ4 = (q4: unknown) =>
  OPTIONS.q4.find((option) => option.ordinal === q4);

/** 12 B5 "90 ~ 100점": the top of the 원점수 range for 성취평가제. */
const ACHIEVEMENT_MAX = (() => {
  const row = sheetRows("12_환산_성취평가제").find((r) => r.r === 5);
  const max = row && textCell(row, 1).match(/(\d+)점$/)?.[1];
  if (!max) throw new Error("missing 12 B5 score range");
  return Number(max);
})();

/**
 * Accepted q6, q6r and q6s values per q4 (review W3): 9등급제 and 5등급제 from
 * the 16 r6-r7 labels, 성취평가제 0 to the 12 B5 max (12 B11: E has no lower bound),
 * and 잘 모르겠어요 on the 9-grade scale (16 r9: 환산 없음).
 */
export const gradeBoundsOf = (q4: unknown) => {
  const option = labelOfQ4(q4);
  const max = Number.parseInt(option?.label ?? "", 10);
  if (!Number.isNaN(max)) return { min: 1, max };
  if (option?.code === "12_환산_성취평가제") {
    return { min: 0, max: ACHIEVEMENT_MAX };
  }
  return { min: 1, max: Number.parseInt(OPTIONS.q4[0]?.label ?? "", 10) };
};

/**
 * M3 q6s scores are 원점수 for table 10, whatever q4 says: the 성취평가제 range
 * (customer answer 2026-11-24 학습진단 5번).
 */
const MIDDLE_SCORE_BOUNDS = gradeBoundsOf(ACHIEVEMENT_Q4);

const inBounds = (value: unknown, { min, max }: { min: number; max: number }) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isGrade = (value: unknown, q4: unknown) => {
  const { min, max } = gradeBoundsOf(q4);
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
};

const MBTI_VALUES = OPTIONS.q22.map((option) =>
  String(option.code).slice("MBTI:".length),
);

const SINGLE_CHOICES = {
  q1: OPTIONS.q1,
  q2: OPTIONS.q2,
  q3: OPTIONS.q3,
  q4: OPTIONS.q4,
  q5: OPTIONS.q5,
  q8: OPTIONS.q8,
  q8s: OPTIONS.q8s,
  q8d: OPTIONS.q8d,
  q16: OPTIONS.q16,
  q17: OPTIONS.q17,
  q18: OPTIONS.q18,
} as const;

const LIKERT_SIZES = {
  q9: SCALE_ITEMS.q9.length,
  q20: SCALE_ITEMS.q20.length,
  q11: SCALE_ITEMS.q11.H12.length,
  q23: SCALE_ITEMS.q23.length,
} as const;

/** Option whose label the 13 H note quotes in 「」 for a hiding rule. */
const hidingOption = (qid: QuestionId, rows: readonly OptionRow[]) => {
  const meta = sheetRows("13_문항메타").find((row) => row.c[0] === qid);
  const quoted = meta && textCell(meta, 7).match(/「(.+?)」/)?.[1];
  const option = quoted && rows.find((o) => o.label.startsWith(quoted));
  if (!option) throw new Error(`no hiding option for ${qid}`);
  return option.ordinal;
};

const Q3_NO_TARGET = hidingOption("q3r", OPTIONS.q3);
const Q8_NOT_COMPARABLE = hidingOption("q8s", OPTIONS.q8);
const Q8S_UNKNOWN = hidingOption("q8d", OPTIONS.q8s);
/** 13 H7: q3 options 1..3 open the target university and major inputs. */
export const Q3_TARGET_ORDINALS = [1, 2, 3];

/** One 06_임계값 row by its B label. */
const thresholdRow = (label: string) => {
  const row = sheetRows("06_임계값").find((r) => r.c[1] === label);
  if (!row) throw new Error(`missing 06 row ${label}`);
  return row;
};
/** 06 C51 switch for q6s, q6r, q6m. */
const SUBJECT_GRADES_ON = thresholdRow("과목별 성적 수집").c[2] === "사용";

export const isHidden = (
  question: QuestionId | "q3Target",
  input: Raw,
  track: TrackCode | null,
) => {
  switch (question) {
    // a missing or invalid q3 is reported on q3 itself
    case "q3r":
      return input.q3 === Q3_NO_TARGET;
    case "q3Target":
      return (
        isOrdinalOf(OPTIONS.q3, input.q3) &&
        !Q3_TARGET_ORDINALS.includes(input.q3 as number)
      );
    case "q8s":
      return input.q8 === undefined || input.q8 === Q8_NOT_COMPARABLE;
    case "q8d":
      return input.q8s === undefined || input.q8s === Q8S_UNKNOWN;
    case "q6s":
      return !SUBJECT_GRADES_ON;
    case "q6r":
    case "q6m":
      return !SUBJECT_GRADES_ON || track === "M3";
    case "q15":
      return track === "M3";
    case "q16":
    case "q17":
    case "q18":
      return input.q15 === undefined;
    default:
      return false;
  }
};

/** 13 F 복수선택(최대 N). */
const maxPicks = (qid: QuestionId) => {
  const meta = sheetRows("13_문항메타").find((row) => row.c[0] === qid);
  const max = meta && textCell(meta, 5).match(/최대 (\d+)/)?.[1];
  if (!max) throw new Error(`no max picks for ${qid}`);
  return Number(max);
};

const MULTI_CHOICES = {
  q3r: { max: maxPicks("q3r"), rows: () => OPTIONS.q3r },
  q10: { max: maxPicks("q10"), rows: () => OPTIONS.q10 },
  q12: { max: maxPicks("q12"), rows: (track: TrackCode) => OPTIONS.q12[track] },
  q14: { max: maxPicks("q14"), rows: () => OPTIONS.q14 },
} as const;
type MultiChoice = keyof typeof MULTI_CHOICES;
const isMultiChoice = (question: string): question is MultiChoice =>
  Object.hasOwn(MULTI_CHOICES, question);

const isPickList = (rows: readonly OptionRow[], value: unknown) =>
  Array.isArray(value) &&
  new Set(value).size === value.length &&
  value.every((pick) => isOrdinalOf(rows, pick));

/** 16 r24: an exclusive option sent with others is ignored. */
const withoutLoneExclusive = (rows: readonly OptionRow[], picks: number[]) => {
  const rest = picks.filter(
    (pick) => !rows.some((o) => o.ordinal === pick && o.exclusive),
  );
  return rest.length > 0 ? rest : picks;
};

/** 06 C55: q13 dates may fall on Day 1..42. */
export const EVENT_WINDOW_DAYS = numberCell(thresholdRow("일정 수집 범위"), 2);
const MAX_EVENTS = maxPicks("q13");

/** Exclusive q13 choices, the 14 EVENT: codes without a date kind. */
const EVENT_CHOICES = ["NONE", "UNKNOWN"];
const EVENT_KINDS = OPTIONS.q13
  .map((option) => String(option.code).slice("EVENT:".length))
  .filter((kind) => !EVENT_CHOICES.includes(kind));

const DAY_MS = 86_400_000;

/** Day number of date with diagnosedAt as Day 1; null for a malformed date. */
const dayOf = (date: unknown, diagnosedAt: IsoDate): number | null => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (
    Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== date // tz-literal-ok: round-trips a UTC-anchored date to check it exists, zone-free
  ) {
    return null;
  }
  return (time - Date.parse(`${diagnosedAt}T00:00:00Z`)) / DAY_MS + 1;
};

const isEvent = (value: unknown, diagnosedAt: IsoDate) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "date", "subject"]) ||
    !EVENT_KINDS.includes(value.kind as string)
  ) {
    return false;
  }
  if (value.subject !== undefined && !isShortText(value.subject)) {
    return false;
  }
  const day = dayOf(value.date, diagnosedAt);
  return day !== null && day >= 1 && day <= EVENT_WINDOW_DAYS;
};

/** Review W1: one event per kind and date. */
const hasDuplicateEvent = (events: readonly Raw[]) =>
  new Set(events.map((e) => `${e.kind}|${e.date}`)).size !== events.length;

const SUBJECTS = ["KOR", "MATH", "ENG", "SOC", "SCI"];
const MOCK_SUBJECTS = [...SUBJECTS, "HIST"];
/** judge-report R3: one exam month, March to November. */
export const MOCK_MONTHS = { first: 3, last: 11 };
/** Mock exams always use the 9-grade scale. */
const MOCK_GRADE_MAX = 9;

const isGradeMap = (
  value: unknown,
  subjects: readonly string[],
  isGradeValue: (grade: unknown) => boolean,
) =>
  isRecord(value) &&
  Object.entries(value).every(
    ([subject, grade]) => subjects.includes(subject) && isGradeValue(grade),
  );

const isText = (value: unknown) => typeof value === "string" && value !== "";

const isAdmissionTarget = (value: unknown) =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "universityKey",
    "departmentKey",
    "mainTrack",
    "admissionTrack",
    "subjectReflection",
  ]) &&
  isText(value.universityKey) &&
  isText(value.departmentKey) &&
  isText(value.mainTrack) &&
  isText(value.admissionTrack) &&
  (value.subjectReflection === null || isText(value.subjectReflection));

const isMiddle = (input: Raw) =>
  isOrdinalOf(OPTIONS.q1, input.q1) && trackOf(input.q1 as number) === "M3";

const isValid = (
  question: QuestionId | "q3Target",
  value: unknown,
  input: Raw,
) => {
  if (Object.hasOwn(SINGLE_CHOICES, question)) {
    return isOrdinalOf(
      SINGLE_CHOICES[question as keyof typeof SINGLE_CHOICES],
      value,
    );
  }
  if (Object.hasOwn(LIKERT_SIZES, question)) {
    return isLikertBlock(
      value,
      LIKERT_SIZES[question as keyof typeof LIKERT_SIZES],
    );
  }
  switch (question) {
    case "q6":
      // M3: not trusted, validateAnswers sets it from the six q6s scores
      return isMiddle(input) || isGrade(value, input.q4);
    case "q6r":
      return isGrade(value, input.q4);
    case "q6s":
      return isMiddle(input)
        ? isGradeMap(value, MIDDLE_SUBJECT_CODES, (grade) =>
            inBounds(grade, MIDDLE_SCORE_BOUNDS),
          )
        : isGradeMap(value, SUBJECTS, (grade) => isGrade(grade, input.q4));
    case "q6m":
      return (
        isRecord(value) &&
        hasOnlyKeys(value, ["month", "grades"]) &&
        Number.isInteger(value.month) &&
        (value.month as number) >= MOCK_MONTHS.first &&
        (value.month as number) <= MOCK_MONTHS.last &&
        isGradeMap(
          value.grades,
          MOCK_SUBJECTS,
          (grade) =>
            Number.isInteger(grade) &&
            (grade as number) >= 1 &&
            (grade as number) <= MOCK_GRADE_MAX,
        )
      );
    case "q15":
      return isAdmissionTarget(value);
    case "q3Target":
      return (
        isRecord(value) &&
        hasOnlyKeys(value, ["university", "major"]) &&
        Object.values(value).every(isShortText)
      );
    case "q21":
      return (
        isRecord(value) &&
        hasOnlyKeys(value, ["weekday", "weekend"]) &&
        isOrdinalOf(OPTIONS.q21Weekday, value.weekday) &&
        isOrdinalOf(OPTIONS.q21Weekend, value.weekend)
      );
    case "q22":
      return MBTI_VALUES.includes(value as string);
    case "q13":
      return EVENT_CHOICES.includes(value as string);
    default:
      return true;
  }
};

const KNOWN_KEYS: ReadonlySet<string> = new Set([...QUESTION_IDS, "q3Target"]);

export function validateAnswers(
  input: unknown,
  diagnosedAt: IsoDate,
): ValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: REQUIRED_QUESTIONS.map((question) => ({
        question,
        reason: "missing",
      })),
    };
  }
  const errors: ValidationError[] = [];
  const answers: Record<string, unknown> = {};
  const track = isOrdinalOf(OPTIONS.q1, input.q1)
    ? trackOf(input.q1 as number)
    : null;
  for (const key of Object.keys(input)) {
    // review W1: only 13_문항메타 ids (and q3Target, 13 H7) are kept
    if (!KNOWN_KEYS.has(key)) {
      if (!errors.some((error) => error.question === "unknown")) {
        errors.push({ question: "unknown", reason: "invalid" });
      }
      continue;
    }
    const question = key as QuestionId | "q3Target";
    const value = input[question];
    if (value === undefined) continue;
    answers[question] = value;
    if (isHidden(question, input, track)) {
      errors.push({ question, reason: "hidden" });
    } else if (isMultiChoice(question)) {
      if (track === null) continue;
      const { max, rows } = MULTI_CHOICES[question];
      const options = rows(track);
      if (!isPickList(options, value)) {
        errors.push({ question, reason: "invalid" });
        continue;
      }
      const picks = withoutLoneExclusive(options, value as number[]);
      if (picks.length > max) errors.push({ question, reason: "too_many" });
      answers[question] = picks;
    } else if (question === "q13" && Array.isArray(value)) {
      if (
        value.length === 0 ||
        !value.every((e) => isEvent(e, diagnosedAt)) ||
        hasDuplicateEvent(value)
      ) {
        errors.push({ question, reason: "invalid" });
      } else if (value.length > MAX_EVENTS) {
        errors.push({ question, reason: "too_many" });
      }
    } else if (!isValid(question, value, input)) {
      errors.push({ question, reason: "invalid" });
    }
  }
  if (track === "M3" && !isHidden("q6s", input, track)) {
    // all six scores are required, and q6 is theirs (mean, 0.1 step)
    const scores = answers.q6s;
    const rejected = errors.some((error) => error.question === "q6s");
    const average = isRecord(scores) ? middleAverage(scores) : null;
    if (average !== null) answers.q6 = average;
    else if (!rejected) errors.push({ question: "q6s", reason: "missing" });
  }
  for (const question of REQUIRED_QUESTIONS) {
    if (question === "q6" && track === "M3") continue;
    if (input[question] === undefined) {
      errors.push({ question, reason: "missing" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, answers: answers as DiagnosisV3Answers };
}
