// Response reliability F1..F6 and verdicts (17_신뢰도, spec No 42-47).

import { LIKERT_LEVELS, type Likert } from "./likert.js";
import { sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Answers, DiagnosisV3Scores } from "./types.js";

type Reliability = DiagnosisV3Scores["reliability"];

const rows = sheetRows("17_신뢰도");
const cellOf = (code: string, col: number) => {
  const row = rows.find((r) => r.c[0] === code);
  if (!row) throw new Error(`missing 17_신뢰도 ${code}`);
  return textCell(row, col);
};

/** Likert indexes of the \u300c..\u300d answer labels quoted in a 17 D cell. */
const quotedAnswers = (code: string): readonly Likert[] =>
  [...cellOf(code, 3).matchAll(/\u300c(.+?)\u300d/g)].map((match) => {
    const index = LIKERT_LEVELS.findIndex((level) => level.label === match[1]);
    if (index < 0) throw new Error(`no answer ${match[1]} in 17 ${code}`);
    return index as Likert;
  });

// 17 D6-D9: V1, V2 flag on the quoted answers; V3, V4 flag on any other answer.
const V1_FLAG = quotedAnswers("V1");
const V2_FLAG = quotedAnswers("V2");
const V3_PASS = quotedAnswers("V3");
const V4_PASS = quotedAnswers("V4");

export function scoreReliability(answers: DiagnosisV3Answers): Reliability {
  const flags = {
    F1: V1_FLAG.includes(answers.q9.verify),
    F2: V2_FLAG.includes(answers.q11.verify),
    F3: !V3_PASS.includes(answers.q20.verify),
    F4: !V4_PASS.includes(answers.q23.verify),
    F5: false,
    F6: false,
  };
  return { flags, diagnosis: "GOOD", temperament: "NORMAL" };
}
