// 2p 목표 (22 r29-r36).

import { numbersIn, reportCell } from "../copy.js";
import { SCALE_ITEMS, scaleValue } from "../likert.js";
import { OPTIONS } from "../options.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  GoalCell,
} from "../types.js";

// 22 r29 D: "목표 명확(C) = 3번 1~3번 선택"
const [CLEAR_FROM, CLEAR_TO] = numbersIn(
  reportCell(29, 3),
  /3번 (\d)~(\d)번/,
) as [number, number];
// 22 r35 D: "중간 = 8-1 ≥ 50 / 가까운 = 8-2 ≥ 50"
const [MID_ITEM, MID_MIN] = numbersIn(
  reportCell(35, 3),
  /중간 = 8-(\d+) ≥ (\d+)/,
) as [number, number];
const [NEAR_ITEM, NEAR_MIN] = numbersIn(
  reportCell(35, 3),
  /가까운 = 8-(\d+) ≥ (\d+)/,
) as [number, number];

/** q3 is one of the clear-target options (22 r29, r35 먼 목표). */
export const isClearGoal = (q3: number) => q3 >= CLEAR_FROM && q3 <= CLEAR_TO;

const itemScore = (answers: DiagnosisV3Answers, no: number) => {
  const answer = answers.q9.items[no - 1];
  if (answer === undefined) throw new Error("missing q9 item " + no);
  return scaleValue(SCALE_ITEMS.q9, no, answer);
};

/** 14 q3r MOT:IN / MOT:EX counts of the picked reasons. */
export function motivationCounts(answers: DiagnosisV3Answers) {
  const picked = (answers.q3r ?? []).map((ordinal) =>
    OPTIONS.q3r.find((o) => o.ordinal === ordinal),
  );
  return {
    intrinsic: picked.filter((o) => o?.code === "MOT:IN").length,
    extrinsic: picked.filter((o) => o?.code === "MOT:EX").length,
    exclusive: picked.some((o) => o?.exclusive),
  };
}

/** 22 r29 cell and 22 r35 ladder. */
export function goalOf(answers: DiagnosisV3Answers): DiagnosisV3Scores["goal"] {
  const clear = isClearGoal(answers.q3);
  const { intrinsic, extrinsic, exclusive } = motivationCounts(answers);
  // 22 r29: 미응답, 「아직 알아보지 못했어요」 or q3r hidden is NA
  const motive = exclusive
    ? "NA"
    : intrinsic > extrinsic
      ? "IN"
      : extrinsic > intrinsic
        ? "EX"
        : intrinsic > 0
          ? "MIX"
          : "NA";
  return {
    cell: ((clear ? "C_" : "E_") + motive) as GoalCell,
    ladder: {
      far: clear,
      mid: itemScore(answers, MID_ITEM) >= MID_MIN,
      near: itemScore(answers, NEAR_ITEM) >= NEAR_MIN,
    },
  };
}
