// v3 survey question definitions. Every title, helper and page comes from
// 13_문항메타 (score source v3.0); this file only types and orders them.

import { QUESTION_IDS, type QuestionId } from "@/lib/diagnosis-v3/codes";
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
    };
  });

/** Last 13 B page, spec row 6: six screens. */
export const SURVEY_V3_PAGES = Math.max(
  ...SURVEY_V3_QUESTIONS.map((question) => question.page),
);
