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
    };
  });

/** Last 13 B page, spec row 6: six screens. */
export const SURVEY_V3_PAGES = Math.max(
  ...SURVEY_V3_QUESTIONS.map((question) => question.page),
);
