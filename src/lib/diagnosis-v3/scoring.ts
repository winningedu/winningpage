// Area scores (spec No 32-41; score sheets 01, 02, 03, 05, 06, 16).

import {
  AREAS,
  type AreaCode,
  MIND_CODES,
  type MindCode,
  P1_CODES,
  P2_CODES,
  type P2Code,
  type TrackCode,
} from "./codes.js";
import { type Likert, SCALE_ITEMS, scaleValue } from "./likert.js";
import { OPTIONS, trackOf } from "./options.js";
import { roundHalfUpInt } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Answers } from "./types.js";

const thresholdRows = sheetRows("06_임계값");
const thresholdRow = (label: string) => {
  const row = thresholdRows.find((r) => r.c[1] === label);
  if (!row) throw new Error(`missing 06_임계값 ${label}`);
  return row;
};

/** "0.7" as an integer percent, so the area formula stays integer. */
const percentCell = (label: string) =>
  Math.round(Number(textCell(thresholdRow(label), 2)) * 100);

// 06 C6 척도 비중, C7 보조 비중.
export const SCALE_PERCENT = percentCell("척도 비중");
export const AUX_PERCENT = percentCell("보조 비중");

// 03_단일선택 A5-A10: Q03_goal points by option label.
const goalPoints = (ordinal: number): number => {
  const label = OPTIONS.q3.find((o) => o.ordinal === ordinal)?.label;
  const row = sheetRows("03_단일선택").find(
    (r) => r.c[0] === "Q03_goal" && r.c[1] === label,
  );
  if (!row) throw new Error(`no Q03_goal points for q3 ${ordinal}`);
  return numberCell(row, 2);
};

type Scale = {
  readonly sum: number;
  readonly count: number;
};

const scaleOf = <A extends string>(
  items: readonly { no: number; area: A; reverse: boolean }[],
  answers: readonly Likert[],
  area: A,
): Scale => {
  const values = items
    .filter((item) => item.area === area)
    .map((item) => {
      const answer = answers[item.no - 1];
      if (answer === undefined) throw new Error(`missing item ${item.no}`);
      return scaleValue(items, item.no, answer);
    });
  return { sum: values.reduce((a, b) => a + b, 0), count: values.length };
};

/**
 * 05 B6 / spec No 32: scale mean x 0.7 + aux x 0.3, rounded once on the exact
 * fraction (judge-report 3-1).
 */
const combine = (scale: Scale, aux: number | null) =>
  aux === null
    ? roundHalfUpInt(scale.sum, scale.count)
    : roundHalfUpInt(
        SCALE_PERCENT * scale.sum + AUX_PERCENT * aux * scale.count,
        100 * scale.count,
      );

// 06 C9-C11 (어려움 0개 / 1개 / 2개): 2 or more checks score the 2개 value (00 B7).
const CHECK_POINTS = [
  numberCell(thresholdRow("어려움 0개"), 2),
  numberCell(thresholdRow("어려움 1개"), 2),
  numberCell(thresholdRow("어려움 2개"), 2),
] as const;
const checkPoints = (checks: number) =>
  CHECK_POINTS[Math.min(checks, CHECK_POINTS.length - 1)] as number;

/** Picks mapped to the area; EXCLUSIVE rows carry no area, so they never count (16 r24). */
const checksOf = (
  options: readonly { ordinal: number; area?: string }[],
  picked: readonly number[] | undefined,
  area: string,
) =>
  (picked ?? []).filter(
    (ordinal) => options.find((o) => o.ordinal === ordinal)?.area === area,
  ).length;

// 05 D: Q03_goal, Q10, Q12 or 없음 (scale mean as is, spec No 32).
const auxOf = (
  answers: DiagnosisV3Answers,
  track: TrackCode,
  code: AreaCode,
): number | null => {
  const aux = AREAS[code].aux;
  if (aux === "Q03_goal") return goalPoints(answers.q3);
  if (aux === "Q10")
    return checkPoints(checksOf(OPTIONS.q10, answers.q10, code));
  if (aux === "Q12")
    return checkPoints(checksOf(OPTIONS.q12[track], answers.q12, code));
  if (aux === "없음") return null;
  throw new Error(`aux ${aux} not handled for ${code}`);
};

const scoresOf = <C extends AreaCode>(
  codes: readonly C[],
  items: readonly { no: number; area: C; reverse: boolean }[],
  block: readonly Likert[],
  answers: DiagnosisV3Answers,
  track: TrackCode,
) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      {
        score: combine(
          scaleOf(items, block, code),
          auxOf(answers, track, code),
        ),
      },
    ]),
  ) as Record<C, { score: number }>;

export function scoreAreas(answers: DiagnosisV3Answers) {
  const track = trackOf(answers.q1);
  return {
    track,
    grade: answers.q1,
    page1: {
      areas: scoresOf(
        P1_CODES,
        SCALE_ITEMS.q9,
        answers.q9.items,
        answers,
        track,
      ),
    },
    mind: {
      areas: scoresOf<MindCode>(
        MIND_CODES,
        SCALE_ITEMS.q20,
        answers.q20.items,
        answers,
        track,
      ),
    },
    page2: {
      areas: scoresOf<P2Code>(
        P2_CODES[track],
        SCALE_ITEMS.q11[track],
        answers.q11.items,
        answers,
        track,
      ),
    },
  };
}
