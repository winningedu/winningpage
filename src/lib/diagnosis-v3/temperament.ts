// Temperament engine (spec rows 87-110, score sheet 18_기질설정, copy sheet 13).
// Pure TS: sheet constants are read at module load, text lives in COPY_TEXT.

import {
  TEMP_DIMS,
  TEMP_FACTORS,
  type TempDim,
  type TempFactor,
  TRACK_NAMES,
  type TrackCode,
} from "./codes.js";
import { type Likert, SCALE_ITEMS, scaleValue } from "./likert.js";
import { roundHalfUpInt } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type { LikertBlock, TempRuleArea } from "./types.js";

const tempSheet = sheetRows("18_기질설정");
const tempRow = (r: number) => {
  const row = tempSheet.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 18_기질설정 r${r}`);
  return row;
};

export type TempLevel = "H" | "M" | "L";

// 18 r14-r16: 높음 70, 중간 40, 낮음 0 ("이 점수 이상").
const LEVEL_ROWS: readonly { level: TempLevel; min: number }[] = [
  { level: "H", min: numberCell(tempRow(14), 2) },
  { level: "M", min: numberCell(tempRow(15), 2) },
  { level: "L", min: numberCell(tempRow(16), 2) },
];

export const tempLevelOf = (score: number): TempLevel => {
  const found = LEVEL_ROWS.find((row) => score >= row.min);
  if (!found) throw new Error(`no temperament level for ${score}`);
  return found.level;
};

export type TempDimScore = {
  readonly score: number;
  readonly level: TempLevel;
  /** 23 r14: items at the extreme (매우 그렇다, reverse items 전혀) of 5 */
  readonly extremes: number;
};

/** 18 r6-r12: 5 items per dimension, the 5th reversed (01 Q23); V4 is not part of items. */
export function temperamentDims(
  q23: LikertBlock,
): Readonly<Record<TempDim, TempDimScore>> {
  const items = SCALE_ITEMS.q23;
  const dims = {} as Record<TempDim, TempDimScore>;
  for (const dim of TEMP_DIMS) {
    const values = items
      .filter((item) => item.area === dim)
      .map((item) => {
        const answer: Likert | undefined = q23.items[item.no - 1];
        if (answer === undefined) throw new Error(`no q23 answer ${item.no}`);
        return scaleValue(items, item.no, answer);
      });
    const score = roundHalfUpInt(
      values.reduce((sum, value) => sum + value, 0),
      values.length,
    );
    dims[dim] = {
      score,
      level: tempLevelOf(score),
      extremes: values.filter((value) => value === 100).length,
    };
  }
  return dims;
}

// 18 r18 C: candidates and their fixed order (NS, HA, RD, PS).
const REP_CANDIDATES = textCell(tempRow(18), 2)
  .split(" \u00b7 ")
  .map((code) => {
    const dim = TEMP_DIMS.find((d) => d === code);
    if (!dim) throw new Error(`unknown candidate ${code}`);
    return dim;
  });

// 18 r19: a gap under this value between 1st and 2nd is 혼합형.
const MIXED_GAP = numberCell(tempRow(19), 2);

export type Representative = {
  readonly kind: "single" | "mixed";
  /** 1st candidate */
  readonly dim: TempDim;
  /** 1st and 2nd candidate, set when kind is mixed */
  readonly dims?: readonly [TempDim, TempDim];
  /** all four candidates, best first (23 r13-r15 order) */
  readonly ranked: readonly TempDim[];
};

/** 18 r18-r19 with the 23 r13-r15 tie rule: score, extreme answers, fixed order. */
export function representativeTemperament(
  dims: Readonly<Record<TempDim, TempDimScore>>,
): Representative {
  const ranked = [...REP_CANDIDATES].sort(
    (a, b) =>
      dims[b].score - dims[a].score ||
      dims[b].extremes - dims[a].extremes ||
      REP_CANDIDATES.indexOf(a) - REP_CANDIDATES.indexOf(b),
  );
  const [first, second] = ranked;
  if (!first || !second) throw new Error("need two representative candidates");
  const mixed = dims[first].score - dims[second].score < MIXED_GAP;
  return mixed
    ? { kind: "mixed", dim: first, dims: [first, second], ranked }
    : { kind: "single", dim: first, ranked };
}

type LabelBand = {
  readonly op: "ge" | "lt" | "else";
  readonly value: number;
  readonly label: string;
};

/** "61 이상 안정형 / 31 이상 균형형 / 그 외 긴장 민감형 (note)", first segment only. */
const parseBands = (note: string): readonly LabelBand[] =>
  (note.split(" \u00b7 ")[0] ?? "")
    .replace(/\s*\(.*$/, "")
    .split(" / ")
    .map((part): LabelBand => {
      const bounded = part.match(/^(\d+) (이상|미만) (.+)$/);
      if (bounded?.[1] && bounded[3]) {
        return {
          op: bounded[2] === "이상" ? "ge" : "lt",
          value: Number(bounded[1]),
          label: bounded[3],
        };
      }
      const rest = part.match(/^그 외 (.+)$/);
      if (!rest?.[1]) throw new Error(`bad band ${part}`);
      return { op: "else", value: 0, label: rest[1] };
    });

// 18 r22-r25: B = "F_x name", D = label bands.
const FACTOR_ROWS = Object.fromEntries(
  TEMP_FACTORS.map((factor, i) => {
    const row = tempRow(22 + i);
    const [code, ...name] = textCell(row, 1).split(" ");
    if (code !== factor) throw new Error(`18 r${row.r} is ${code}`);
    return [
      factor,
      { name: name.join(" "), bands: parseBands(textCell(row, 3)) },
    ];
  }),
) as Record<TempFactor, { name: string; bands: readonly LabelBand[] }>;

const labelOf = (factor: TempFactor, score: number): string => {
  const band = FACTOR_ROWS[factor].bands.find(
    (b) =>
      b.op === "else" || (b.op === "ge" ? score >= b.value : score < b.value),
  );
  if (!band) throw new Error(`no label for ${factor} ${score}`);
  return band.label;
};

export type SwayCause = "NS" | "SD" | "RD";

export type TemperamentFactors = {
  readonly scores: Readonly<Record<TempFactor, number>>;
  /** copy id suffix, TEMP_F_<x>_<label> */
  readonly labels: Readonly<Record<TempFactor, string>>;
  readonly names: Readonly<Record<TempFactor, string>>;
  readonly swayCause: SwayCause;
};

/** 18 r22-r25 formulas on exact integers, half-up (judge-report 3-1). */
export function temperamentFactors(
  dims: Readonly<Record<TempDim, { readonly score: number }>>,
): TemperamentFactors {
  const [ns, ha, rd, ps, sd] = [
    dims.NS.score,
    dims.HA.score,
    dims.RD.score,
    dims.PS.score,
    dims.SD.score,
  ] as const;
  const scores: Record<TempFactor, number> = {
    F_STAB: 100 - ha, // 18 C22
    F_SWAY: roundHalfUpInt(ns + (100 - sd) + rd, 3), // 18 C23
    F_PRESS: roundHalfUpInt(2 * (100 - ha) + sd + ps, 4), // 18 C24
    F_SUST: roundHalfUpInt(2 * ps + sd + (100 - ns), 4), // 18 C25
  };
  // 18 D23 names the largest of NS, 100-SD, RD; ties follow that order (R12).
  const causes: readonly (readonly [SwayCause, number])[] = [
    ["NS", ns],
    ["SD", 100 - sd],
    ["RD", rd],
  ];
  const swayCause = causes.reduce((best, next) =>
    next[1] > best[1] ? next : best,
  )[0];
  return {
    scores,
    labels: Object.fromEntries(
      TEMP_FACTORS.map((f) => [f, labelOf(f, scores[f])]),
    ) as Record<TempFactor, string>,
    names: Object.fromEntries(
      TEMP_FACTORS.map((f) => [f, FACTOR_ROWS[f].name]),
    ) as Record<TempFactor, string>,
    swayCause,
  };
}

// 18 r29 (XCHK_HA) and r30 (XCHK_SUST) are prose cells, so the thresholds are
// typed here and temperament.test.ts asserts they appear in the cells.
const XCHK_HA_HIGH = 70;
const XCHK_HA_LOW = 40;
const XCHK_SUST_LOW = 40;
const XCHK_SUST_HIGH = 70;
const XCHK_EXEC_HIGH = 70;
const XCHK_EXEC_LOW = 45;

export type CrossCheckInput = {
  readonly ha: number;
  /** q20 item 5 answer before reversal (불안, 18 r29 "Q20-5 원응답") */
  readonly q20Item5: Likert;
  readonly sust: number;
  /** P1_EXEC (학습 수행) area score */
  readonly exec: number;
};

export function temperamentCrossChecks(input: CrossCheckInput): {
  readonly xchkHa: boolean;
  readonly xchkSust: boolean;
} {
  // Likert 0 전혀, 1 별로, 3 대체로, 4 매우
  const lowAnswer = input.q20Item5 <= 1;
  const highAnswer = input.q20Item5 >= 3;
  return {
    xchkHa:
      (input.ha >= XCHK_HA_HIGH && lowAnswer) ||
      (input.ha < XCHK_HA_LOW && highAnswer),
    xchkSust:
      (input.sust < XCHK_SUST_LOW && input.exec >= XCHK_EXEC_HIGH) ||
      (input.sust >= XCHK_SUST_HIGH && input.exec < XCHK_EXEC_LOW),
  };
}

/** Values a sheet condition may name: [NS] .. [ST], [F_STAB] .. [F_SUST], area scores. */
export type ConditionVars = Readonly<Record<string, number>>;

/** Evaluates 18 conditions: ALWAYS, or comparisons joined by AND or OR (never both). */
const holds = (condition: string, vars: ConditionVars): boolean => {
  if (condition === "ALWAYS") return true;
  const joiner = condition.includes(" OR ") ? " OR " : " AND ";
  const checks = condition.split(joiner).map((part) => {
    const match = part.match(/^\[(.+)\] (>=|<) (\d+)$/);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new Error(`unreadable condition ${part}`);
    }
    const value = vars[match[1]];
    if (value === undefined) throw new Error(`no value for [${match[1]}]`);
    return match[2] === ">="
      ? value >= Number(match[3])
      : value < Number(match[3]);
  });
  return joiner === " OR " ? checks.some(Boolean) : checks.every(Boolean);
};

// 18 r32-r48 B column: rule id, area name, tracks, direction, joined by " \u00b7 ".
const RULE_AREA_BY_NAME: Readonly<Record<string, TempRuleArea>> = {
  "고교 유형 선택": "HS",
  "수시 / 정시 비중": "AD_RATIO",
  "학생부종합 준비": "AD_HOLISTIC",
  "선행 속도": "PACE",
  "과목 선택": "SUBJ",
};

type RuleRow = {
  readonly id: string;
  readonly area: TempRuleArea;
  readonly tracks: readonly string[];
  readonly condition: string;
};

const RULES: readonly RuleRow[] = tempSheet
  .filter((row) => row.r >= 32 && row.r <= 48)
  .map((row) => {
    const [id, areaName, ...rest] = textCell(row, 1).split(" \u00b7 ");
    const area = areaName ? RULE_AREA_BY_NAME[areaName] : undefined;
    if (!id || !area) throw new Error(`unreadable rule row r${row.r}`);
    return {
      id,
      area,
      tracks: rest.slice(0, -1),
      condition: textCell(row, 2),
    };
  });

// 18 r31 header: at most 2 rules per area.
const RULE_MAX_PER_AREA = 2;

/**
 * 18 r31 and 23 r109: per area of the track, the first two rules (sheet order)
 * whose condition holds. An area with no hit stays listed as [] so the page
 * can show TEMP_RULE_NONE. Rules of other tracks are skipped.
 */
export function temperamentRules(
  track: TrackCode,
  vars: ConditionVars,
): Partial<Record<TempRuleArea, readonly string[]>> {
  const rules: Partial<Record<TempRuleArea, string[]>> = {};
  for (const rule of RULES) {
    if (!rule.tracks.includes(TRACK_NAMES[track])) continue;
    const hits = rules[rule.area] ?? [];
    rules[rule.area] = hits;
    if (hits.length < RULE_MAX_PER_AREA && holds(rule.condition, vars)) {
      hits.push(rule.id);
    }
  }
  return rules;
}
