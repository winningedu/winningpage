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

const verdictCell = (group: string, label: string) => {
  const row = rows.find((r) => r.c[0] === group && r.c[1] === label);
  if (!row) throw new Error(`missing 17_신뢰도 ${group} ${label}`);
  return textCell(row, 2);
};
const numberIn = (text: string, pattern: RegExp) => {
  const value = Number(text.match(pattern)?.[1]);
  if (Number.isNaN(value)) throw new Error(`no number in ${text}`);
  return value;
};

// 17 C14 "F5 또는 (F1+F2+F3) \u2265 2", C15 "(F1+F2+F3) = 1 이고 F5 아님".
const SIMPLE_MIN = numberIn(
  verdictCell("학습진단", "응답 단순"),
  /\u2265 (\d+)/,
);
const MID_SUM = numberIn(verdictCell("학습진단", "보통"), /= (\d+)/);

// 17 C11 "같은 응답이 10개 이상 연속 AND q10 미선택"
const F5_RUN = numberIn(cellOf("F5", 2), /(\d+)개 이상 연속/);

const longestRun = (items: readonly Likert[]) => {
  let longest = 0;
  let current = 0;
  items.forEach((item, i) => {
    current = i > 0 && item === items[i - 1] ? current + 1 : 1;
    longest = Math.max(longest, current);
  });
  return longest;
};

export function scoreReliability(answers: DiagnosisV3Answers): Reliability {
  const flags = {
    F1: V1_FLAG.includes(answers.q9.verify),
    F2: V2_FLAG.includes(answers.q11.verify),
    F3: !V3_PASS.includes(answers.q20.verify),
    F4: !V4_PASS.includes(answers.q23.verify),
    // 16 r26: any q10 pick, the exclusive one included, counts as picked
    F5: longestRun(answers.q9.items) >= F5_RUN && !answers.q10?.length,
    F6: false,
  };
  const verifyFlags = [flags.F1, flags.F2, flags.F3].filter(Boolean).length;
  const diagnosis =
    flags.F5 || verifyFlags >= SIMPLE_MIN
      ? "SIMPLE"
      : verifyFlags === MID_SUM
        ? "MID"
        : "GOOD";
  // 17 C17 "F4 또는 F6"
  const temperament = flags.F4 || flags.F6 ? "CAUTION" : "NORMAL";
  return { flags, diagnosis, temperament };
}
