// Exam operation verdict (21 C35, spec row 76) from the q9 exam item and
// the q10 exam-room option. Item, option and cut-offs are read from 21 C35.

import { LIKERT_LEVELS } from "./likert.js";
import { sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Answers, DiagnosisV3Scores } from "./types.js";

export type ExamOpsVerdict = DiagnosisV3Scores["examOps"];

const rule = sheetRows("21_4주플랜").find((row) => row.r === 35);
if (!rule) throw new Error("missing 21_4주플랜 r35");
// "8-15 \u2264 25 OR 10번 15항목 선택 ... / 8-15 \u2265 75 AND 미선택 ..."
const parsed = textCell(rule, 2).match(
  /^8-(\d+) \u2264 (\d+) OR 10번 (\d+)항목 .* 8-\d+ \u2265 (\d+) AND /,
);
if (!parsed) throw new Error("unexpected 21 C35 text");
/** q9 item number of the exam item (8-15) */
export const EXAM_ITEM = Number(parsed[1]);
const RISK_MAX = Number(parsed[2]);
/** q10 option ordinal of 시험장 실수 */
export const EXAM_OPTION = Number(parsed[3]);
const OK_MIN = Number(parsed[4]);

export function judgeExamOps(answers: DiagnosisV3Answers): ExamOpsVerdict {
  const answer = answers.q9.items[EXAM_ITEM - 1];
  const score = answer === undefined ? undefined : LIKERT_LEVELS[answer]?.score;
  if (score === undefined) throw new Error(`missing q9 item ${EXAM_ITEM}`);
  const picked = answers.q10?.includes(EXAM_OPTION) ?? false;
  if (score <= RISK_MAX || picked) return "RISK";
  if (score >= OK_MIN) return "OK";
  return "MID";
}
