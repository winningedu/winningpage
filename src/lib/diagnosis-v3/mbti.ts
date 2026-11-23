// MBTI block (spec rows 111-113, score sheet 19_MBTI데이터, copy sheet 14).
// Pure TS: sheet constants are read at module load, text lives in COPY_TEXT.

import { AREAS, type AreaCode } from "./codes.js";
import { copy, fill } from "./copy.js";
import { roundHalfUp1 } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import { COPY_SHEETS } from "./source/copyText.js";
import type { DiagnosisV3Scores, MbtiType, Page8 } from "./types.js";

const mbtiSheet = sheetRows("19_MBTI데이터");
const mbtiRow = (r: number) => {
  const row = mbtiSheet.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 19_MBTI데이터 r${r}`);
  return row;
};

/** First integer after a marker in a prose cell, e.g. "n ÷ 2,042" or "60 미만". */
const proseNumber = (text: string, pattern: RegExp): number => {
  const match = text.match(pattern);
  if (!match?.[1]) throw new Error(`no number in "${text}"`);
  return Number(match[1].replace(/,/g, ""));
};

// 19 B23: "표본 n ÷ 2,042 × 100, 소수점 1자리".
const STUDY_TOTAL = proseNumber(textCell(mbtiRow(23), 1), /÷ ([\d,]+)/);
// 19 B25: "표본 n이 60 미만이면 MBTI_SMALLN 문구 추가".
const SMALL_SAMPLE_BELOW = proseNumber(textCell(mbtiRow(25), 1), /(\d+) 미만/);

// 19 r5-r20: type, 표본 n, then five factor counts (C-G, factor numbers 1-5).
const TYPE_ROWS = new Map(
  mbtiSheet
    .filter((row) => row.r >= 5 && row.r <= 20)
    .map((row) => [
      textCell(row, 0) as MbtiType,
      {
        n: numberCell(row, 1),
        factors: [2, 3, 4, 5, 6].map((col) => numberCell(row, col)),
      },
    ]),
);

export type MbtiScore = NonNullable<DiagnosisV3Scores["mbti"]>;

/** NONE or no answer gives null (14 r171, spec row 113). */
export function scoreMbti(
  type: MbtiType | "NONE" | undefined,
): MbtiScore | null {
  if (type === undefined || type === "NONE") return null;
  const row = TYPE_ROWS.get(type);
  if (!row) throw new Error(`no 19_MBTI데이터 row for ${type}`);
  const top = Math.max(...row.factors);
  return {
    type,
    sampleN: row.n,
    sharePct: roundHalfUp1(row.n * 100, STUDY_TOTAL),
    topFactors: row.factors.flatMap((count, i) =>
      count === top ? [i + 1] : [],
    ),
    smallSample: row.n < SMALL_SAMPLE_BELOW,
  };
}

type LinkKind = "P" | "J" | "F" | "T";

// 14 MBTI_LINK_<x>_LOW rows: C = "<area label> <n> 미만" gives the area and the
// threshold; the HIGH row of the same letter is the other side of it.
const LINK_RULES = Object.fromEntries(
  (["P", "J", "F", "T"] as const).map((kind) => {
    const row = (COPY_SHEETS["14_MBTI문구"] ?? []).find(
      (candidate) => candidate.c[0] === `MBTI_LINK_${kind}_LOW`,
    );
    const match = String(row?.c[2]).match(/^(.+) (\d+) 미만$/);
    const area = Object.values(AREAS).find((a) => a.label === match?.[1]);
    if (!match?.[2] || !area) throw new Error(`unreadable link rule ${kind}`);
    return [kind, { area: area.code, below: Number(match[2]) }];
  }),
) as Record<LinkKind, { area: AreaCode; below: number }>;

export type MbtiLink = { readonly id: string; readonly score: number };

/**
 * Spec row 112 and 22 r82: the P or J letter and the F or T letter each link
 * to one diagnosis area score. P and J come before F and T.
 */
export function mbtiLinks(
  type: MbtiType,
  areaScores: Readonly<Partial<Record<AreaCode, number>>>,
): readonly MbtiLink[] {
  const kinds = [type.charAt(3), type.charAt(2)] as LinkKind[];
  return kinds.map((kind) => {
    const rule = LINK_RULES[kind];
    const score = areaScores[rule.area];
    if (score === undefined) throw new Error(`no score for ${rule.area}`);
    return {
      id: `MBTI_LINK_${kind}_${score < rule.below ? "LOW" : "HIGH"}`,
      score,
    };
  });
}

// 19 r4 C-G: factor names, factor number n is MBTI_HABIT_n.
const FACTOR_NAMES = [2, 3, 4, 5, 6].map((col) => {
  const row = mbtiSheet.find((candidate) => candidate.r === 4);
  if (!row) throw new Error("missing 19_MBTI데이터 r4");
  return textCell(row, col);
});

const habitsOf = (numbers: readonly number[]) =>
  numbers.map((n) => copy(`MBTI_HABIT_${n}`));

/** 22 r79-r84: the whole MBTI page 8 from the answer and the link scores. */
export function mbtiPage8(
  type: MbtiType | "NONE" | undefined,
  areaScores: Readonly<Partial<Record<AreaCode, number>>>,
): Page8 {
  const disclaimer = copy("MBTI_DISCLAIMER");
  const score = scoreMbti(type);
  if (!score) {
    return {
      mbti: {
        kind: "none",
        text: copy("MBTI_NONE"),
        habits: habitsOf([1, 2, 3, 4, 5]),
      },
      disclaimer,
    };
  }
  return {
    mbti: {
      kind: "type",
      card: {
        type: score.type,
        nick: copy(`MBTI_${score.type}_NICK`),
        style: copy(`MBTI_${score.type}_STYLE`),
        share: fill("mbti.share", {
          n: score.sampleN,
          pct: score.sharePct.toFixed(1),
        }),
      },
      poles: [...score.type].map((letter) => ({
        letter,
        name: copy(`MBTI_POLE_${letter}_NAME`),
        habit: copy(`MBTI_POLE_${letter}_HABIT`),
        tip: copy(`MBTI_POLE_${letter}_TIP`),
      })),
      factors: {
        text: fill("mbti.top", {
          type: score.type,
          factors: score.topFactors.map((n) => FACTOR_NAMES[n - 1]).join(", "),
        }),
        habits: habitsOf(score.topFactors),
        ...(score.smallSample ? { smallSample: copy("MBTI_SMALLN") } : {}),
      },
      links: mbtiLinks(score.type, areaScores).map((link) =>
        fill(link.id, { score: link.score }),
      ),
    },
    disclaimer,
  };
}
