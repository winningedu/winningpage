// Service fit and ranking, 07_서비스 (spec rows 82-85, 91). Pure TS: the site
// callmentor filter is not here (judge-report R1), only the 2 recommendations.

import {
  AREAS,
  type AreaCode,
  MIND_CODES,
  P1_CODES,
  P2_CODES,
  SERVICE_CODES,
  type ServiceCode,
  TRACK_NAMES,
  type TrackCode,
} from "./codes.js";
import { OPTIONS, trackOf } from "./options.js";
import { roundHalfUp1, roundHalfUpInt } from "./round.js";
import { sheetRows, textCell } from "./sheet.js";
import type { Ordinal, ServiceFit } from "./types.js";

type ServiceRow = {
  readonly code: ServiceCode;
  readonly question: "Q10" | "Q12";
  readonly difficultyKey: string;
  readonly relatedAreas: string;
  readonly q14Items: readonly number[];
};

const sheet07 = sheetRows("07_서비스");
const cellAt = (r: number): string => {
  const row = sheet07.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 07 row ${r}`);
  return textCell(row, 1);
};
const matchOf = (text: string, pattern: RegExp): readonly number[] => {
  const found = pattern.exec(text);
  if (!found) throw new Error(`07 cell does not match ${pattern}: ${text}`);
  return found.slice(1).map(Number);
};

// 07 B26 "어려움 50 \u00b7 희망 20 \u00b7 결핍 30"
const [DIFFICULTY_POINTS, HOPE_POINTS, DEFICIT_POINTS] = matchOf(
  cellAt(26),
  /어려움 (\d+) \u00b7 희망 (\d+) \u00b7 결핍 (\d+)/,
) as [number, number, number];
// 07 B27 "분모 = 그 서비스에 매핑된 항목 수(최대 2)"
const [DENOMINATOR_CAP] = matchOf(cellAt(27), /최대 (\d+)/) as [number];
// 07 B31 "매우 추천 80 이상 / 추천 65 이상 80 미만 / 필요성 있음 65 미만"
const [S1_FROM, S2_FROM] = matchOf(
  cellAt(31),
  /(\d+) 이상 \/ 추천 (\d+) 이상/,
) as [number, number];
// 07 B29 "MAX(0, 50 - 점수)": the score at which the deficit is zero
const [DEFICIT_ZERO_AT] = matchOf(cellAt(29), /MAX\(0, (\d+)/) as [number];

/** 07 rows 5-14, one per service and track group. */
const serviceRows = (track: TrackCode): readonly ServiceRow[] =>
  sheet07
    .filter(
      (row) =>
        row.r >= 5 &&
        row.r <= 14 &&
        (row.c[2] === "공통" || row.c[2] === TRACK_NAMES[track]),
    )
    .map((row) => ({
      code: textCell(row, 0) as ServiceCode,
      question: textCell(row, 3) as "Q10" | "Q12",
      difficultyKey: textCell(row, 4),
      relatedAreas: textCell(row, 5),
      q14Items: textCell(row, 6).split(",").map(Number),
    }));

const trackAreas = (track: TrackCode): readonly AreaCode[] => [
  ...P1_CODES,
  ...P2_CODES[track],
  ...MIND_CODES,
];

const areasByLabel = (track: TrackCode, labels: string): AreaCode[] =>
  labels.split(/,\s*/).map((label) => {
    const area = trackAreas(track).find((code) => AREAS[code].label === label);
    if (!area) throw new Error(`07 area ${label} not in track ${track}`);
    return area;
  });

/** Option ordinals the service counts as a difficulty (07 E column). */
const mappedOrdinals = (track: TrackCode, row: ServiceRow): number[] => {
  const options = row.question === "Q10" ? OPTIONS.q10 : OPTIONS.q12[track];
  if (row.difficultyKey.startsWith("항목")) {
    return [...row.difficultyKey.matchAll(/(\d+)번/g)].map((m) => Number(m[1]));
  }
  const areas = areasByLabel(track, row.difficultyKey);
  return options
    .filter((option) => option.area && areas.includes(option.area))
    .map((option) => option.ordinal);
};

export type ServiceInput = {
  /** q1 ordinal, keeps 고3 vs N수 apart */
  readonly grade: Ordinal;
  readonly diagnosedAt: string;
  /** null falls back to diagnosedAt (07 B24) */
  readonly joinedAt: string | null;
  /** final area scores, PAGE1, track PAGE2 and MIND */
  readonly areaScores: Readonly<Partial<Record<AreaCode, number>>>;
  readonly q10: readonly Ordinal[];
  readonly q12: readonly Ordinal[];
  readonly q14: readonly Ordinal[];
  /** 18 TEMP_COUNSEL as computed, before the 07 B34 exclusions */
  readonly counsel: boolean;
  readonly reliability: {
    readonly diagnosis: "SIMPLE" | "MID" | "GOOD";
    readonly temperament: "CAUTION" | "NORMAL";
  };
};

export type ServicesResult = {
  /** 07 C16-C21 candidate scope */
  readonly scope: "ALL" | "M3" | "NSU" | "G3LATE";
  readonly ranked: readonly [ServiceFit, ServiceFit];
};

const bandOf = (tenths: number): ServiceFit["band"] =>
  tenths >= S1_FROM * 10 ? "S1" : tenths >= S2_FROM * 10 ? "S2" : "S3";

type Scored = ServiceFit & {
  readonly tenths: number;
  readonly sumScore: number;
  readonly count: number;
};

/** 23 r17-r20: fit, then hope, then lower related mean, then code order. */
const compareFit = (a: Scored, b: Scored): number =>
  b.tenths - a.tenths ||
  b.hope - a.hope ||
  a.sumScore * b.count - b.sumScore * a.count ||
  SERVICE_CODES.indexOf(a.code) - SERVICE_CODES.indexOf(b.code);

const scoreService = (
  track: TrackCode,
  row: ServiceRow,
  input: ServiceInput,
): Scored => {
  const mapped = mappedOrdinals(track, row);
  const picked = row.question === "Q10" ? input.q10 : input.q12;
  const checks = picked.filter((ordinal) => mapped.includes(ordinal)).length;
  const denominator = Math.min(mapped.length, DENOMINATOR_CAP);
  const counted = Math.min(checks, denominator);

  const hopeOn = input.q14.some((ordinal) => row.q14Items.includes(ordinal));
  const hope = hopeOn ? HOPE_POINTS : 0;

  const related = areasByLabel(track, row.relatedAreas).map((area) => {
    const score = input.areaScores[area];
    if (score === undefined) throw new Error(`missing score for ${area}`);
    return score;
  });
  const count = related.length;
  const sumScore = related.reduce((sum, score) => sum + score, 0);
  const sumDeficit = related.reduce(
    (sum, score) => sum + Math.max(0, DEFICIT_ZERO_AT - score),
    0,
  );

  // fit = counted / denominator * 50 + hope + sumDeficit / (50 * count) * 30,
  // kept as one exact fraction so half-up rounding never sees a float.
  const whole = denominator * DEFICIT_ZERO_AT * count;
  const numerator =
    DIFFICULTY_POINTS * counted * DEFICIT_ZERO_AT * count +
    hope * whole +
    DEFICIT_POINTS * sumDeficit * denominator;

  const tenths = roundHalfUpInt(10 * numerator, whole);
  return {
    code: row.code,
    fit: roundHalfUp1(numerator, whole),
    difficulty: roundHalfUp1(DIFFICULTY_POINTS * counted, denominator),
    hope,
    deficit: roundHalfUp1(DEFICIT_POINTS * sumDeficit, DEFICIT_ZERO_AT * count),
    relatedMean: roundHalfUp1(sumScore, count),
    band: bandOf(tenths),
    tenths,
    sumScore,
    count,
  };
};

// 07 B23 "기준 월": joined before this month is 고3 전기, from it 고3 후기
const [LATE_FROM_MONTH] = matchOf(cellAt(23), /^(\d+)$/) as [number];

/** Candidate group labels as 07 C16-C21 write them. */
const SEGMENT_BY_SCOPE = {
  M3: TRACK_NAMES.M3,
  NSU: "N수",
  G3LATE: "고3후기",
} as const;

const scopeOf = (
  track: TrackCode,
  grade: Ordinal,
  month: number,
): ServicesResult["scope"] => {
  if (track === "M3") return "M3";
  if (track === "H12") return "ALL";
  const sub = OPTIONS.q1
    .find((option) => option.ordinal === grade)
    ?.code?.split("|")[1];
  if (sub === "N수") return "NSU";
  return month < LATE_FROM_MONTH ? "ALL" : "G3LATE";
};

/** Service codes in the candidate lists for one group label (07 rows 16-21). */
const candidatesOf = (segment: string): readonly string[] =>
  sheet07
    .filter((row) => row.r >= 16 && row.r <= 21)
    .filter((row) => textCell(row, 2).split(" \u00b7 ").includes(segment))
    .map((row) => textCell(row, 0));

export function recommendServices(input: ServiceInput): ServicesResult {
  const track = trackOf(input.grade);
  const month = Number((input.joinedAt ?? input.diagnosedAt).slice(5, 7));
  const scope = scopeOf(track, input.grade, month);
  const segment =
    scope === "ALL"
      ? track === "H12"
        ? TRACK_NAMES.H12
        : "고3전기"
      : SEGMENT_BY_SCOPE[scope];
  const candidates = candidatesOf(segment);
  const scored = serviceRows(track)
    .filter((row) => candidates.includes(row.code))
    .map((row) => scoreService(track, row, input));
  scored.sort(compareFit);
  const [first, second] = scored;
  if (!first || !second) throw new Error("fewer than 2 service candidates");
  return { scope, ranked: [strip(first), strip(second)] };
}

const strip = ({
  tenths: _tenths,
  sumScore: _sumScore,
  count: _count,
  ...fit
}: Scored): ServiceFit => fit;
