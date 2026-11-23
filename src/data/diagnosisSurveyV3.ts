// v3 survey question definitions. Every title, helper and page comes from
// 13_문항메타 (score source v3.0); this file only types and orders them.

import {
  QUESTION_IDS,
  type QuestionId,
  REQUIRED_QUESTIONS,
  type TrackCode,
} from "@/lib/diagnosis-v3/codes";
import { SCALE_ITEMS } from "@/lib/diagnosis-v3/likert";
import { OPTIONS, type OptionRow } from "@/lib/diagnosis-v3/options";
import { numberCell, sheetRows, textCell } from "@/lib/diagnosis-v3/sheet";

export type SurveyV3Question = {
  readonly id: QuestionId;
  /** 13 B */
  readonly page: number;
  /** 13 C */
  readonly category: string;
  /** 13 D */
  readonly title: string;
  /** 13 E */
  readonly helper: string | undefined;
  /** screen number shown on the card, 기능요구명세서 B column */
  readonly label: string;
  /** 13 G = 필수 */
  readonly required: boolean;
  /** input widget, read from the 13 F text */
  readonly kind: SurveyV3Kind;
  /** 13 F 단일선택(칩) */
  readonly chip: boolean;
  /** 13 F 최대 N */
  readonly maxPicks: number | undefined;
};

export type SurveyV3Kind =
  | "single"
  | "multi"
  | "likert"
  | "number"
  | "grades"
  | "mock"
  | "schedule"
  | "pair"
  | "cascade";

/** 13 F input type text to widget, first match wins. */
const KIND_BY_INPUT_TYPE: readonly [RegExp, SurveyV3Kind][] = [
  [/^단일선택 × 2/, "pair"],
  [/^단일선택/, "single"],
  [/^복수선택/, "multi"],
  [/^리커트/, "likert"],
  [/^숫자 입력 1칸/, "number"],
  [/^숫자 입력/, "grades"],
  [/^월 선택/, "mock"],
  [/^일정 입력/, "schedule"],
  [/^연쇄선택/, "cascade"],
];

const kindOf = (inputType: string): SurveyV3Kind => {
  const match = KIND_BY_INPUT_TYPE.find(([pattern]) => pattern.test(inputType));
  if (!match) throw new Error(`unknown 13 F input type ${inputType}`);
  return match[1];
};

// 기능요구명세서 B14-B34 screen numbers (judge-report numbering map).
const SCREEN_LABELS: Readonly<Record<QuestionId, string>> = {
  q1: "1",
  q2: "2",
  q3: "3",
  q3r: "3-1",
  q4: "4",
  q5: "5",
  q6: "6",
  q6s: "6-1",
  q6r: "6-2",
  q6m: "6-3",
  q8: "7",
  q8s: "7-1",
  q8d: "7-2",
  q9: "8",
  q20: "9",
  q10: "10",
  q11: "11",
  q12: "12",
  q13: "13",
  q21: "14",
  q14: "15",
  q15: "16",
  q16: "17",
  q17: "18",
  q18: "19",
  q22: "20",
  q23: "21",
};

const metaRows = sheetRows("13_문항메타").filter((row) => row.r > 4);

const metaOf = (id: QuestionId) => {
  const row = metaRows.find((r) => r.c[0] === id);
  if (!row) throw new Error(`missing 13_문항메타 row ${id}`);
  return row;
};

const maxPicksOf = (inputType: string) => {
  const max = inputType.match(/최대 (\d+)/)?.[1];
  return max === undefined ? undefined : Number(max);
};

export const SURVEY_V3_QUESTIONS: readonly SurveyV3Question[] =
  QUESTION_IDS.map((id) => {
    const row = metaOf(id);
    const helper = row.c[4];
    return {
      id,
      page: numberCell(row, 1),
      category: textCell(row, 2),
      title: textCell(row, 3),
      helper:
        helper === null || helper === undefined ? undefined : String(helper),
      label: SCREEN_LABELS[id],
      required: REQUIRED_QUESTIONS.includes(id),
      kind: kindOf(textCell(row, 5)),
      chip: textCell(row, 5).includes("(칩)"),
      maxPicks: maxPicksOf(textCell(row, 5)),
    };
  });

export type ChoiceQuestion = Exclude<
  keyof typeof OPTIONS,
  "q21Weekday" | "q21Weekend"
>;

/**
 * 14_선택지코드 rows (q2 13 H6, q4 and q5 16). q12 rows depend on the track;
 * before q1 is answered (track null) q12 has none.
 */
export function choicesFor(
  id: ChoiceQuestion,
  track: TrackCode | null,
): readonly OptionRow[] {
  if (id !== "q12") return OPTIONS[id];
  return track === null ? [] : OPTIONS.q12[track];
}

/** q21 weekday and weekend rows; labels are the 14 keys q21/평일, q21/주말. */
export const PAIR_CHOICES = [
  { key: "weekday", label: "평일", rows: OPTIONS.q21Weekday },
  { key: "weekend", label: "주말", rows: OPTIONS.q21Weekend },
] as const;

/** q13 event field labels (kind, date, subject), from the 13 F24 input type. */
export const SCHEDULE_FIELD_LABELS = (() => {
  const inputType = textCell(metaOf("q13"), 5);
  const [kind, date, subject] =
    inputType.match(/\((.+)\)/)?.[1]?.split("\u00b7") ?? [];
  if (!kind || !date || !subject) throw new Error("missing 13 F24 fields");
  return { kind, date, subject };
})();

/** Field labels of the q3 target inputs, read from the 13 H7 note. */
export const Q3_TARGET_LABELS = (() => {
  const note = textCell(metaOf("q3"), 7);
  const match = note.match(/(목표 대학)\u00b7(학과) 입력칸/);
  if (!match?.[1] || !match[2]) throw new Error("missing 13 H7 target labels");
  return { university: match[1], major: match[2] };
})();

export type Statement = { readonly key: string; readonly text: string };

type LikertQuestion = keyof typeof SCALE_ITEMS;

// 17_신뢰도 A6-A9: the check item that closes each scale question.
const VERIFY_CODES: Readonly<Record<LikertQuestion, string>> = {
  q9: "V1",
  q11: "V2",
  q20: "V3",
  q23: "V4",
};

const verifyText = (code: string) => {
  const row = sheetRows("17_신뢰도").find((r) => r.c[0] === code);
  if (!row) throw new Error(`missing 17_신뢰도 row ${code}`);
  return textCell(row, 2);
};

/**
 * 01_척도문항 items by No (key "1".."n") plus the 17 check item (key "V").
 * q11 items depend on the track; before q1 is answered q11 has none.
 */
export function statementsFor(
  id: LikertQuestion,
  track: TrackCode | null,
): readonly Statement[] {
  if (id === "q11" && track === null) return [];
  const items =
    id === "q11" ? SCALE_ITEMS.q11[track as TrackCode] : SCALE_ITEMS[id];
  return [
    ...items.map((item) => ({ key: String(item.no), text: item.text })),
    { key: "V", text: verifyText(VERIFY_CODES[id]) },
  ];
}

/** Last 13 B page, spec row 6: six screens. */
export const SURVEY_V3_PAGES = Math.max(
  ...SURVEY_V3_QUESTIONS.map((question) => question.page),
);
