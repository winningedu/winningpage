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
import type {
  AreaScore,
  AreaState,
  DiagnosisV3Answers,
  GradeLevel,
} from "./types.js";

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

/** Rows of one 06 A group, top to bottom ("이 점수 이상"). */
const groupRows = (group: string) =>
  thresholdRows.filter((r) => r.c[0] === group);

// 06 r14-r18 등급 80 / 70 / 60 / 45 / 0 = L1..L5 (spec No 39, 41).
const LEVELS: readonly GradeLevel[] = ["L1", "L2", "L3", "L4", "L5"];
const LEVEL_FLOORS = groupRows("등급").map((r) => numberCell(r, 2));

// 06 r20-r23 상태라벨 70 / 60 / 45 / 0 = TOP, MID, LOW, WEAK (spec No 40).
const STATES: readonly AreaState[] = ["TOP", "MID", "LOW", "WEAK"];
const STATE_ROWS = groupRows("상태라벨");
const STATE_FLOORS = STATE_ROWS.map((r) => numberCell(r, 2));

const bandOf = <T>(
  codes: readonly T[],
  floors: readonly number[],
  score: number,
): T => {
  const index = floors.findIndex((floor) => score >= floor);
  const code = codes[index];
  if (code === undefined) throw new Error(`no band for ${score}`);
  return code;
};

export const gradeLevel = (score: number): GradeLevel =>
  bandOf(LEVELS, LEVEL_FLOORS, score);
export const areaState = (score: number): AreaState =>
  bandOf(STATES, STATE_FLOORS, score);

/** 06 B20-B23 "PAGE1 상위 / PAGE2 양호"; MIND uses the PAGE1 labels. */
export const AREA_STATE_LABELS = (() => {
  const parts = STATE_ROWS.map((r) => {
    const match = textCell(r, 1).match(/^PAGE1 (.+) \/ PAGE2 (.+)$/);
    if (!match?.[1] || !match[2]) throw new Error(`bad 06 B${r.r}`);
    return { page1: match[1], page2: match[2] };
  });
  const labels = (page: "page1" | "page2") =>
    Object.fromEntries(
      STATES.map((state, i) => [state, parts[i]?.[page]]),
    ) as Record<AreaState, string>;
  return { page1: labels("page1"), page2: labels("page2") };
})();

// 03_단일선택 A5-A10: Q03_goal points by option label.
const goalPoints = (ordinal: number): number => {
  const label = OPTIONS.q3.find((o) => o.ordinal === ordinal)?.label;
  const row = sheetRows("03_단일선택").find(
    (r) => r.c[0] === "Q03_goal" && r.c[1] === label,
  );
  if (!row) throw new Error(`no Q03_goal points for q3 ${ordinal}`);
  return numberCell(row, 2);
};

/** 0..100 values of the area's scale items, reversed for 역문항 (01 F). */
const scaleValues = <A extends string>(
  items: readonly { no: number; area: A; reverse: boolean }[],
  answers: readonly Likert[],
  area: A,
): number[] =>
  items
    .filter((item) => item.area === area)
    .map((item) => {
      const answer = answers[item.no - 1];
      if (answer === undefined) throw new Error(`missing item ${item.no}`);
      return scaleValue(items, item.no, answer);
    });

/**
 * 05 B6 / spec No 32: scale mean x 0.7 + aux x 0.3, rounded once on the exact
 * fraction (judge-report 3-1). Aux 없음 keeps the scale mean.
 */
const combine = (values: readonly number[], aux: number | null) => {
  const sum = values.reduce((a, b) => a + b, 0);
  const count = values.length;
  return aux === null
    ? roundHalfUpInt(sum, count)
    : roundHalfUpInt(
        SCALE_PERCENT * sum + AUX_PERCENT * aux * count,
        100 * count,
      );
};

// 06 C9-C11 (어려움 0개 / 1개 / 2개): 2 or more checks score the 2개 value (00 B7).
const CHECK_POINTS = [
  numberCell(thresholdRow("어려움 0개"), 2),
  numberCell(thresholdRow("어려움 1개"), 2),
  numberCell(thresholdRow("어려움 2개"), 2),
] as const;
const checkPoints = (checks: number) =>
  CHECK_POINTS[Math.min(checks, CHECK_POINTS.length - 1)] as number;

// 06 C8 목표 점수.
export const TARGET_SCORE = numberCell(thresholdRow("목표 점수"), 2);

type Picks = {
  readonly options: readonly { ordinal: number; area?: AreaCode }[];
  readonly picked: readonly number[] | undefined;
};

/** Picks mapped to the area; EXCLUSIVE rows carry no area, so they never count (16 r24). */
const checksOf = ({ options, picked }: Picks, area: AreaCode) =>
  (picked ?? []).filter(
    (ordinal) => options.find((o) => o.ordinal === ordinal)?.area === area,
  ).length;

// 05 D: Q03_goal, Q10 / Q12 (check points) or 없음.
const auxOf = (
  answers: DiagnosisV3Answers,
  code: AreaCode,
  checks: number,
): number | null => {
  const aux = AREAS[code].aux;
  if (aux === "Q03_goal") return goalPoints(answers.q3);
  if (aux === "Q10" || aux === "Q12") return checkPoints(checks);
  if (aux === "없음") return null;
  throw new Error(`aux ${aux} not handled for ${code}`);
};

const scoresOf = <C extends AreaCode>(
  codes: readonly C[],
  items: readonly { no: number; area: C; reverse: boolean }[],
  block: readonly Likert[],
  picks: Picks,
  answers: DiagnosisV3Answers,
) =>
  Object.fromEntries(
    codes.map((code) => {
      const values = scaleValues(items, block, code);
      const checks = checksOf(picks, code);
      const score = combine(values, auxOf(answers, code, checks));
      const area: AreaScore = {
        score,
        state: areaState(score),
        level: gradeLevel(score),
        gapToTarget: Math.max(0, TARGET_SCORE - score),
        checks,
        minItem: Math.min(...values),
      };
      return [code, area];
    }),
  ) as Record<C, AreaScore>;

export function scoreAreas(answers: DiagnosisV3Answers) {
  const track = trackOf(answers.q1);
  // 23 r7: q10 for the seven stages and MIND_RECV, q12 for the track areas.
  const q10: Picks = { options: OPTIONS.q10, picked: answers.q10 };
  const q12: Picks = { options: OPTIONS.q12[track], picked: answers.q12 };
  return {
    track,
    grade: answers.q1,
    page1: {
      areas: scoresOf(P1_CODES, SCALE_ITEMS.q9, answers.q9.items, q10, answers),
    },
    mind: {
      areas: scoresOf<MindCode>(
        MIND_CODES,
        SCALE_ITEMS.q20,
        answers.q20.items,
        q10,
        answers,
      ),
    },
    page2: {
      areas: scoresOf<P2Code>(
        P2_CODES[track],
        SCALE_ITEMS.q11[track],
        answers.q11.items,
        q12,
        answers,
      ),
    },
  };
}
