// 2p 목표 (22 r29-r36).

import { copy, numbersIn, reportCell } from "../copy.js";
import { LIKERT_LEVELS, SCALE_ITEMS, scaleValue } from "../likert.js";
import { OPTIONS } from "../options.js";
import type { Engine } from "../report.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  GoalCell,
  Page2,
} from "../types.js";
import { targetText } from "./p1.js";

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

// 22 r35 D names each rung's question: "먼 목표 = 3번 ...", "중간 = 8-1 ...", "가까운 = 8-2 ..."
const rungSource = (pattern: RegExp) => {
  const source = reportCell(35, 3).match(pattern)?.[1];
  if (!source) throw new Error("unexpected 22 D35 text");
  return source;
};
const FAR_SOURCE = rungSource(/먼 목표 = (\d+번)/);
const MID_SOURCE = rungSource(/중간 = (8-\d+)/);
const NEAR_SOURCE = rungSource(/가까운 = (8-\d+)/);

/** PDF p3 rung: the q9 item statement (01 E) and the answer word (01 A2). */
const itemRung = (answers: DiagnosisV3Answers, no: number, source: string) => {
  const text = SCALE_ITEMS.q9.find((item) => item.no === no)?.text;
  const answer = answers.q9.items[no - 1];
  const word = answer === undefined ? undefined : LIKERT_LEVELS[answer]?.label;
  if (text === undefined || word === undefined)
    throw new Error("missing q9 item " + no);
  return { source, text, answer: word };
};

/** q3 is one of the clear-target options (22 r29, r35 먼 목표). */
const isClearGoal = (q3: number) => q3 >= CLEAR_FROM && q3 <= CLEAR_TO;

const itemScore = (answers: DiagnosisV3Answers, no: number) => {
  const answer = answers.q9.items[no - 1];
  if (answer === undefined) throw new Error("missing q9 item " + no);
  return scaleValue(SCALE_ITEMS.q9, no, answer);
};

/** 14 q3r MOT:IN / MOT:EX counts of the picked reasons. */
function motivationCounts(answers: DiagnosisV3Answers) {
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

/** 13 H8: 3-1 is hidden when 3번 is the 0-point option (14 q3 SCORE:0). */
const reasonsShown = (q3: number) =>
  OPTIONS.q3.find((o) => o.ordinal === q3)?.code !== "SCORE:0";

// 22 r34: rows 명확 (C), 탐색 (E) x columns 내재, 혼합, 외재
const MATRIX: readonly GoalCell[] = [
  "C_IN",
  "C_MIX",
  "C_EX",
  "E_IN",
  "E_MIX",
  "E_EX",
];

// 22 r36: empty rung tip order 가까운, 중간, 먼
const RUNGS = ["near", "mid", "far"] as const;
const RUNG_IDS = { near: "NEAR", mid: "MID", far: "FAR" } as const;

export function buildPage2(engine: Engine): Page2 {
  const { answers } = engine;
  const { cell, ladder } = engine.scores.goal;
  const empty = RUNGS.filter((rung) => !ladder[rung]);
  const [firstEmpty] = empty;
  const counts = motivationCounts(answers);
  return {
    // 22 r30-r31
    title: copy("GOAL_Q_" + cell + "_HEAD"),
    lead: copy("GOAL_LEAD"),
    // 22 r32
    specificity: {
      options: OPTIONS.q3.map((o) => o.label),
      selectedIndex: OPTIONS.q3.findIndex((o) => o.ordinal === answers.q3),
      ...(answers.q3Target?.university
        ? { university: answers.q3Target.university }
        : {}),
      ...(answers.q3Target?.major ? { major: answers.q3Target.major } : {}),
    },
    // 22 r33
    ...(reasonsShown(answers.q3)
      ? {
          reasons: {
            chips: OPTIONS.q3r
              .filter((o) => answers.q3r?.includes(o.ordinal))
              .map((o) => o.label),
            intrinsic: counts.intrinsic,
            extrinsic: counts.extrinsic,
          },
        }
      : {}),
    // 22 r34
    matrix: {
      cells: MATRIX.map((c) => ({
        cell: c,
        name: copy("GOAL_Q_" + c + "_NAME"),
        desc: copy("GOAL_Q_" + c + "_DESC"),
      })),
      // 22 r34 "NA면 강조 없음": the NA cell copy becomes the note
      ...(cell.endsWith("_NA")
        ? {
            note: {
              name: copy("GOAL_Q_" + cell + "_NAME"),
              desc: copy("GOAL_Q_" + cell + "_DESC"),
            },
          }
        : { highlighted: cell }),
    },
    // 22 r35
    ladder: {
      ...ladder,
      text: copy(
        empty.length === 0
          ? "LADDER_FULL"
          : empty.length > 1 || !firstEmpty
            ? "LADDER_GAP_MULTI"
            : "LADDER_GAP_" + RUNG_IDS[firstEmpty],
      ),
      rungs: {
        far: { source: FAR_SOURCE, text: targetText(engine) },
        mid: itemRung(answers, MID_ITEM, MID_SOURCE),
        near: itemRung(answers, NEAR_ITEM, NEAR_SOURCE),
      },
    },
    // 22 r36
    tips: [
      copy("GOAL_Q_" + cell + "_TIP"),
      copy("LADDER_TIP_" + (firstEmpty ? RUNG_IDS[firstEmpty] : "FULL")),
    ],
  };
}
