// Prescription tables (20_처방규칙, spec rows 70-74): weak items with a
// 4-week target answer and a linked plan task, one lever, and strong items.

import {
  type AreaCode,
  TRACK_CODES,
  TRACK_NAMES,
  type TrackCode,
} from "./codes.js";
import { LIKERT_LEVELS, type Likert, SCALE_ITEMS } from "./likert.js";
import type { Plan } from "./plan.js";
import { sheetRows, textCell } from "./sheet.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  LeverCode,
  Prescription,
  PrescriptionItem,
} from "./types.js";

type Question = PrescriptionItem["question"];
type ItemRef = {
  readonly question: Question;
  /** null for q9, the track for q11 */
  readonly track: TrackCode | null;
  readonly no: number;
};

const rxSheet = sheetRows("20_처방규칙");
const rxRow = (r: number) => {
  const row = rxSheet.find((x) => x.r === r);
  if (!row) throw new Error(`missing 20_처방규칙 r${r}`);
  return row;
};
const match = (text: string, pattern: RegExp): RegExpMatchArray => {
  const found = text.match(pattern);
  if (!found) throw new Error(`unexpected sheet text ${text}`);
  return found;
};
/** Captured numbers of a sheet cell; throws when one is missing. */
const numbers = (text: string, pattern: RegExp): [number, number] => {
  const [a, b] = match(text, pattern).slice(1).map(Number);
  if (a === undefined) throw new Error(`no number in ${text}`);
  return [a, b ?? a];
};

/** "Q09-14", "Q11/<track name>-5" */
const parseRef = (text: string): ItemRef => {
  const [, q, trackName, no] = match(text, /^Q(09|11)(?:\/(.+))?-(\d+)$/);
  const track = trackName
    ? TRACK_CODES.find((t) => TRACK_NAMES[t] === trackName)
    : null;
  if (track === undefined) throw new Error(`no track ${trackName}`);
  return { question: q === "09" ? "q9" : "q11", track, no: Number(no) };
};

const LIMITS = /PAGE1 최대 (\d+) \u00b7 PAGE2 최대 (\d+)/;
// 20 B7, C7: weak = answer score at most n, PAGE1 / PAGE2 caps
const [WEAK_MAX] = numbers(textCell(rxRow(7), 1), /^응답 (\d+) 이하/);
const [WEAK_P1, WEAK_P2] = numbers(textCell(rxRow(7), 2), LIMITS);
// 20 B8, C8: strong = answer score at least n, PAGE1 / PAGE2 caps
const [STRONG_MIN] = numbers(textCell(rxRow(8), 1), /^응답 (\d+) 이상/);
const [STRONG_P1, STRONG_P2] = numbers(textCell(rxRow(8), 2), LIMITS);
// 20 B9, C9: default steps up, target capped at score n
const [DEFAULT_STEPS] = numbers(textCell(rxRow(9), 1), /기본 (\d+)\)$/);
const [TARGET_MAX] = numbers(textCell(rxRow(9), 2), /\((\d+)\)$/);
// 20 r12-r14: one-step items
const STEP_EXCEPTIONS = [12, 13, 14].map((r) => ({
  ...parseRef(textCell(rxRow(r), 1)),
  steps: Number(textCell(rxRow(r), 2)),
}));
// 20 r16-r20: levers in priority order, source item in B
const LEVERS = [16, 17, 18, 19, 20].map((r) => ({
  id: textCell(rxRow(r), 0) as LeverCode,
  source: parseRef(textCell(rxRow(r), 1)),
}));

const scoreOf = (answer: Likert): number => {
  const level = LIKERT_LEVELS[answer];
  if (!level) throw new Error(`bad likert ${answer}`);
  return level.score;
};
const TARGET_INDEX = LIKERT_LEVELS.findIndex((l) => l.score === TARGET_MAX);

const sameRef = (
  ref: ItemRef,
  question: Question,
  track: TrackCode,
  no: number,
) =>
  ref.question === question &&
  (ref.track === null || ref.track === track) &&
  ref.no === no;

export type PrescriptionInput = {
  readonly answers: DiagnosisV3Answers;
  readonly track: TrackCode;
  /** area scores of PAGE1 and the track's PAGE2 areas */
  readonly areaScores: Readonly<Partial<Record<AreaCode, number>>>;
  readonly plan: Pick<Plan, "columns" | "tasks">;
};

function prescriptionOf(
  input: PrescriptionInput,
  question: Question,
  caps: { weak: number; strong: number },
): Prescription {
  const { answers, track } = input;
  const items = question === "q9" ? SCALE_ITEMS.q9 : SCALE_ITEMS.q11[track];
  const block = question === "q9" ? answers.q9 : answers.q11;
  const rows: PrescriptionItem[] = items.map((item) => {
    const answer = block.items[item.no - 1];
    if (answer === undefined) throw new Error(`missing ${question} ${item.no}`);
    return { question, no: item.no, area: item.area, answer };
  });
  const levers = LEVERS.filter(({ source }) =>
    rows.some(
      (row) =>
        sameRef(source, question, track, row.no) &&
        scoreOf(row.answer) <= WEAK_MAX,
    ),
  );
  const isLeverSource = (no: number) =>
    LEVERS.some(({ source }) => sameRef(source, question, track, no));
  const areaScore = (area: AreaCode) => {
    const score = input.areaScores[area];
    if (score === undefined) throw new Error(`missing area score ${area}`);
    return score;
  };
  // 20 D7: lever source first, area score low to high, item number
  const weak = rows
    .filter((row) => scoreOf(row.answer) <= WEAK_MAX)
    .sort(
      (a, b) =>
        Number(isLeverSource(b.no)) - Number(isLeverSource(a.no)) ||
        areaScore(a.area) - areaScore(b.area) ||
        a.no - b.no,
    )
    .slice(0, caps.weak)
    .map((row) => {
      const steps =
        STEP_EXCEPTIONS.find((e) => sameRef(e, question, track, row.no))
          ?.steps ?? DEFAULT_STEPS;
      const target = Math.min(row.answer + steps, TARGET_INDEX) as Likert;
      // 20 B10: earliest plan task of the area, else its ACT1 copy
      const task = input.plan.tasks.find((t) => t.area === row.area);
      const link = task
        ? ({ kind: "task", task } as const)
        : ({ kind: "act", actId: `AREA_${row.area}_ACT1` } as const);
      return { ...row, target, link };
    });
  // 20 D8: answer high to low, item number
  const strong = rows
    .filter((row) => scoreOf(row.answer) >= STRONG_MIN)
    .sort((a, b) => b.answer - a.answer || a.no - b.no)
    .slice(0, caps.strong);
  // 20 B21: one lever per page, the first in table order
  return { lever: levers[0]?.id ?? null, weak, strong };
}

export function buildPrescriptions(
  input: PrescriptionInput,
): DiagnosisV3Scores["prescriptions"] {
  return {
    page1: prescriptionOf(input, "q9", { weak: WEAK_P1, strong: STRONG_P1 }),
    page2: prescriptionOf(input, "q11", { weak: WEAK_P2, strong: STRONG_P2 }),
  };
}
