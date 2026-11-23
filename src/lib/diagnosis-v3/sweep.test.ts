// Deterministic sweep over the whole engine: mirrors 98_전수검증 r11-r17 on
// seeded pseudo-random answer sets built through the same option tables.

import { describe, expect, it } from "vitest";
import { AREAS, TRACK_CODES, type TrackCode } from "./codes.js";
import {
  type DiagnosisV3Answers,
  type DiagnosisV3Context,
  type DiagnosisV3Payload,
  scoreDiagnosisV3,
  validateAnswers,
} from "./index.js";
import type { Likert } from "./likert.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS, trackOf } from "./options.js";
import { AREA_STATE_LABELS, areaState } from "./scoring.js";
import { COPY_SHEETS } from "./source/copyText.js";

// ---------------------------------------------------------------------------
// Seeded generator
// ---------------------------------------------------------------------------

/** mulberry32: small deterministic PRNG, the sweep must not depend on Math.random. */
const makeRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
type Rng = () => number;

const int = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T>(rng: Rng, list: readonly T[]): T => {
  const value = list[int(rng, list.length)];
  if (value === undefined) throw new Error("empty pick list");
  return value;
};
const chance = (rng: Rng, p: number) => rng() < p;

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * How Likert answers are drawn: uniform, one fixed raw answer, a random level
 * per group (area or dimension), or chosen scale levels per group (reverse
 * items get the mirrored answer so the scored value is the chosen level).
 */
type LikertMode =
  | { readonly kind: "uniform" }
  | { readonly kind: "fixed"; readonly value: Likert }
  | { readonly kind: "grouped" }
  | {
      readonly kind: "levels";
      /** scale level 0..4 per area or dimension code; others stay random */
      readonly levels: Readonly<Record<string, Likert>>;
    };

type ScaleItemLike = { readonly area: string; readonly reverse: boolean };

const likertBlock = (
  rng: Rng,
  items: readonly ScaleItemLike[],
  mode: LikertMode,
  /** the answer that raises no 17_신뢰도 flag for this block's check item */
  goodVerify: Likert,
): { items: Likert[]; verify: Likert } => {
  const level = new Map<string, Likert>();
  const draw = (item: ScaleItemLike): Likert => {
    if (mode.kind === "fixed") return mode.value;
    if (mode.kind === "uniform") return int(rng, 5) as Likert;
    if (mode.kind === "levels") {
      const chosen = mode.levels[item.area] ?? (int(rng, 5) as Likert);
      return (item.reverse ? 4 - chosen : chosen) as Likert;
    }
    if (!level.has(item.area)) level.set(item.area, int(rng, 5) as Likert);
    const base = level.get(item.area) as Likert;
    return Math.min(4, Math.max(0, base + int(rng, 3) - 1)) as Likert;
  };
  return {
    items: items.map(draw),
    verify:
      mode.kind === "fixed"
        ? mode.value
        : mode.kind === "levels"
          ? goodVerify
          : (int(rng, 5) as Likert),
  };
};

/** Up to max ordinals; an exclusive option is sent alone. */
const picks = (
  rng: Rng,
  rows: readonly { ordinal: number; exclusive: boolean }[],
  max: number,
) => {
  const count = int(rng, max + 1);
  if (count === 0) return undefined;
  const open = rows.filter((row) => !row.exclusive);
  const exclusive = rows.filter((row) => row.exclusive);
  if (exclusive.length > 0 && chance(rng, 0.15)) {
    return [pick(rng, exclusive).ordinal];
  }
  const chosen = new Set<number>();
  while (chosen.size < Math.min(count, open.length)) {
    chosen.add(pick(rng, open).ordinal);
  }
  return [...chosen];
};

const gradeMax = (q4: number) => {
  const max = Number.parseInt(
    OPTIONS.q4.find((o) => o.ordinal === q4)?.label ?? "",
    10,
  );
  return Number.isNaN(max) ? 9 : max;
};
const grade = (rng: Rng, max: number) =>
  Math.round((1 + rng() * (max - 1)) * 100) / 100;

const EVENT_KIND_ORDINALS = OPTIONS.q13
  .map((o) => String(o.code).slice("EVENT:".length))
  .filter((kind) => kind !== "NONE" && kind !== "UNKNOWN") as (
  | "EXAM"
  | "PERF"
  | "MOCK"
  | "APPLY"
  | "ETC"
)[];

type Generated = {
  answers: DiagnosisV3Answers;
  context: DiagnosisV3Context;
  track: TrackCode;
};

function generate(rng: Rng, options: GenOptions = {}): Generated {
  const optional = options.optional ?? true;
  const mode: LikertMode = options.likert ?? {
    kind: pick(rng, ["uniform", "grouped", "grouped"] as const),
  };
  const q1 = options.grade ?? pick(rng, OPTIONS.q1).ordinal;
  const track = trackOf(q1);
  const q4 = pick(rng, OPTIONS.q4).ordinal;
  const diagnosedAt =
    options.diagnosedAt ?? addDays("2026-03-01", int(rng, 365));
  const withQ15 = track !== "M3" && optional && chance(rng, 0.7);

  const raw: Record<string, unknown> = {
    q1,
    q2: pick(rng, OPTIONS.q2).ordinal,
    q3: pick(rng, OPTIONS.q3).ordinal,
    q4,
    q5: pick(rng, OPTIONS.q5).ordinal,
    q6: grade(rng, gradeMax(q4)),
    q9: likertBlock(rng, SCALE_ITEMS.q9, mode, 1),
    q20: likertBlock(rng, SCALE_ITEMS.q20, mode, 2),
    q11: likertBlock(rng, SCALE_ITEMS.q11[track], mode, 1),
    q21: {
      weekday: pick(rng, OPTIONS.q21Weekday).ordinal,
      weekend: pick(rng, OPTIONS.q21Weekend).ordinal,
    },
    q23: likertBlock(rng, SCALE_ITEMS.q23, mode, 3),
  };
  if (optional) {
    raw.q3Target = { university: "U" + int(rng, 9), major: "M" + int(rng, 9) };
    if (chance(rng, 0.5)) raw.q3r = picks(rng, OPTIONS.q3r, 2);
    if (chance(rng, 0.5)) {
      raw.q6s = {
        KOR: grade(rng, gradeMax(q4)),
        MATH: grade(rng, gradeMax(q4)),
      };
      raw.q6r = grade(rng, gradeMax(q4));
      raw.q6m = {
        month: 3 + int(rng, 9),
        grades: {
          KOR: grade(rng, 9),
          MATH: grade(rng, 9),
          HIST: grade(rng, 9),
        },
      };
    }
    if (chance(rng, 0.7)) {
      raw.q8 = pick(rng, OPTIONS.q8).ordinal;
      if (chance(rng, 0.7)) raw.q8s = pick(rng, OPTIONS.q8s).ordinal;
      if (chance(rng, 0.7)) raw.q8d = pick(rng, OPTIONS.q8d).ordinal;
    }
    raw.q10 = picks(rng, OPTIONS.q10, 3);
    raw.q12 = picks(rng, OPTIONS.q12[track], 3);
    raw.q14 = picks(rng, OPTIONS.q14, 2);
    if (chance(rng, 0.5)) raw.q22 = pick(rng, OPTIONS.q22).code?.slice(5);
    const dated = int(rng, 6);
    raw.q13 =
      options.events ??
      (dated === 0
        ? undefined
        : dated === 1
          ? "NONE"
          : dated === 2
            ? "UNKNOWN"
            : Array.from({ length: dated - 2 }, () => ({
                kind: pick(rng, EVENT_KIND_ORDINALS),
                date: addDays(diagnosedAt, int(rng, 42)),
                ...(chance(rng, 0.5) ? { subject: "SUBJ" } : {}),
              })));
  } else if (options.events) {
    raw.q13 = options.events;
  }
  if (withQ15) {
    raw.q15 = {
      universityKey: "u",
      departmentKey: "d",
      mainTrack: "교과",
      admissionTrack: "추천형",
      subjectReflection: null,
    };
    raw.q16 = pick(rng, OPTIONS.q16).ordinal;
    raw.q17 = pick(rng, OPTIONS.q17).ordinal;
    raw.q18 = pick(rng, OPTIONS.q18).ordinal;
  }
  // drop what the track or earlier answers hide, then require a valid set
  let current = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined),
  );
  for (let round = 0; round < 4; round++) {
    const result = validateAnswers(current, diagnosedAt);
    if (result.ok) {
      const hasAdmission = withQ15 && chance(rng, 0.8);
      const cut70 = 1 + rng() * 4;
      return {
        track,
        answers: result.answers,
        context: {
          diagnosedAt,
          joinedAt: chance(rng, 0.5)
            ? addDays(diagnosedAt, -int(rng, 400))
            : null,
          admission:
            hasAdmission && current.q15
              ? {
                  cut50: chance(rng, 0.5) ? cut70 - 0.3 : null,
                  cut70,
                  competitionRate: chance(rng, 0.5) ? rng() * 20 : null,
                  universityName: "U",
                  unitName: "D",
                  typeName: "T",
                  year: 2026,
                }
              : null,
          studentName: chance(rng, 0.5) ? "N" : null,
        },
      };
    }
    const hidden = new Set(
      result.errors.filter((e) => e.reason === "hidden").map((e) => e.question),
    );
    if (hidden.size === 0) {
      throw new Error(
        "generated invalid answers " + JSON.stringify(result.errors),
      );
    }
    current = Object.fromEntries(
      Object.entries(current).filter(([key]) => !hidden.has(key as never)),
    );
  }
  throw new Error("could not build a valid answer set");
}

// ---------------------------------------------------------------------------
// Sweep corpus (built once, shared by the rows)
// ---------------------------------------------------------------------------

const RANDOM_SETS = 600;
const SEED = 98;

type Run = Generated & { payload: DiagnosisV3Payload };
const run = (g: Generated): Run => ({
  ...g,
  payload: scoreDiagnosisV3(g.answers, g.context),
});

const EDGE_DAYS = [1, 28, 29, 42];

const buildRandomRuns = (): Run[] => {
  const rng = makeRng(SEED);
  return Array.from({ length: RANDOM_SETS }, () => run(generate(rng)));
};

const buildEdgeRuns = (): Run[] => {
  const rng = makeRng(SEED + 1);
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    // all 매우 (4) and all 전혀 (0)
    for (const value of [0, 4] as const) {
      runs.push(
        run(generate(rng, { grade, likert: { kind: "fixed", value } })),
      );
    }
    // no optional answers
    runs.push(run(generate(rng, { grade, optional: false })));
    // an event on Day 1, 28, 29 and 42
    for (const day of EDGE_DAYS) {
      const diagnosedAt = "2026-11-09";
      runs.push(
        run(
          generate(rng, {
            grade,
            diagnosedAt,
            events: [{ kind: "EXAM", date: addDays(diagnosedAt, day - 1) }],
          }),
        ),
      );
    }
  }
  return runs;
};

/** Every area and dimension at one scale level, per track and level. */
const buildLevelRuns = (): Run[] => {
  const rng = makeRng(SEED + 2);
  const codes = [
    ...SCALE_ITEMS.q9,
    ...SCALE_ITEMS.q20,
    ...SCALE_ITEMS.q23,
    ...TRACK_CODES.flatMap((t) => SCALE_ITEMS.q11[t]),
  ].map((item) => item.area);
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    for (const value of [0, 1, 2, 3, 4] as const) {
      const levels = Object.fromEntries(codes.map((code) => [code, value]));
      for (const optional of [true, false]) {
        runs.push(
          run(
            generate(rng, {
              grade,
              optional,
              likert: { kind: "levels", levels },
            }),
          ),
        );
      }
    }
  }
  return runs;
};

/** 18 r27 care condition: HA high, SD low, 불안 회복 low, answers consistent. */
const buildCareRuns = (): Run[] => {
  const rng = makeRng(SEED + 3);
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    for (let i = 0; i < 4; i++) {
      runs.push(
        run(
          generate(rng, {
            grade,
            likert: {
              kind: "levels",
              levels: { HA: 4, SD: 0, MIND_RECV: 0, NS: 2, RD: 2, PS: 2 },
            },
          }),
        ),
      );
    }
  }
  return runs;
};

type Corpus = { random: Run[]; edge: Run[]; all: Run[] };
let cached: Corpus | undefined;
/** Built on first use so an engine throw fails the r11 row, not the file load. */
const corpus = (): Corpus => {
  if (!cached) {
    const random = buildRandomRuns();
    const edge = [...buildEdgeRuns(), ...buildLevelRuns(), ...buildCareRuns()];
    cached = { random, edge, all: [...random, ...edge] };
  }
  return cached;
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Payload walkers
// ---------------------------------------------------------------------------

const leafStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) leafStrings(v, out);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) leafStrings(v, out);
  }
  return out;
};

const pageStrings = (r: Run) => leafStrings(r.payload.pages);

describe("98_전수검증 sweep corpus", () => {
  it("covers all three tracks with at least 500 valid random sets plus edge sets", () => {
    const { random, edge } = corpus();
    expect(random.length).toBeGreaterThanOrEqual(500);
    for (const track of TRACK_CODES) {
      expect(random.filter((r) => r.track === track).length).toBeGreaterThan(
        100,
      );
      expect(edge.some((r) => r.track === track)).toBe(true);
    }
  });
});

describe("98_전수검증 r11-r17", () => {
  // 98 r11 실행 오류 0건
  it("r11 실행 오류: scoreDiagnosisV3 never throws on any sweep set", () => {
    expect(corpus().all.length).toBeGreaterThan(RANDOM_SETS);
  });

  // 98 r12 빈칸 미치환: no {placeholder}, None, undefined or NaN; plus 12_금지어
  it("r12 빈칸 미치환: no placeholder, None or undefined in any page string", () => {
    const leaks = new Set<string>();
    for (const r of corpus().all) {
      for (const text of pageStrings(r)) {
        if (/\{[^{}]*\}|\bNone\b|undefined|NaN|\[object/.test(text)) {
          leaks.add(text);
        }
      }
    }
    expect([...leaks]).toEqual([]);
  });

  it("r12 금지어: no 12_금지어 phrase in any page string", () => {
    const phrases = (COPY_SHEETS["12_금지어"] ?? [])
      .filter((row) => row.r >= 5)
      .flatMap((row) => String(row.c[1]).split(" / "))
      .map((phrase) => phrase.trim())
      .filter(Boolean);
    expect(phrases.length).toBeGreaterThan(10);
    const hits = new Set<string>();
    for (const r of corpus().all) {
      for (const text of pageStrings(r)) {
        for (const phrase of phrases) {
          if (text.includes(phrase))
            hits.add(phrase + " :: " + text.slice(0, 60));
        }
      }
    }
    expect([...hits]).toEqual([]);
  });

  // 98 r13 점수 범위 0건: every score 0..100
  it("r13 점수 범위: every score of every payload is within 0..100", () => {
    const bad: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        for (const [i, v] of value.entries()) walk(v, path + "." + i);
      } else if (value && typeof value === "object") {
        for (const [key, v] of Object.entries(value)) {
          if (
            typeof v === "number" &&
            /^(score|total|fit|mean)$/.test(key) &&
            !(v >= 0 && v <= 100)
          ) {
            bad.push(path + "." + key + "=" + v);
          }
          walk(v, path + "." + key);
        }
      }
    };
    for (const r of corpus().all) {
      walk(r.payload.scores, "scores");
      walk(r.payload.pages, "pages");
      for (const factor of Object.values(
        r.payload.scores.temperament.factors,
      )) {
        if (!(factor >= 0 && factor <= 100)) bad.push("factor=" + factor);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  // 98 r14 문장-점수 모순: every bar's state label agrees with its score (06 r20-r23)
  it("r14 문장-점수 모순: every ScoreBar state label matches the state of its score", () => {
    const labels = new Set<string>();
    const mismatches = new Set<string>();
    const stateLabels = AREA_STATE_LABELS;
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        const bar = value as {
          code?: unknown;
          score?: unknown;
          state?: unknown;
        };
        if (
          typeof bar.code === "string" &&
          typeof bar.score === "number" &&
          typeof bar.state === "string" &&
          bar.code in AREAS
        ) {
          labels.add(bar.state);
          const state = areaState(bar.score);
          if (
            bar.state !== stateLabels.page1[state] &&
            bar.state !== stateLabels.page2[state]
          ) {
            mismatches.add(bar.code + " " + bar.score + " " + bar.state);
          }
        }
        Object.values(value).forEach(walk);
      }
    };
    for (const r of corpus().all) walk(r.payload.pages);
    expect(labels.size).toBeGreaterThan(0);
    expect([...mismatches]).toEqual([]);
  });

  // 98 r15 4주 플랜: Day 1..28, no duplicate (task, date)
  it("r15 4주 플랜: task dates stay in Day 1..28 with no duplicate task on a day", () => {
    const problems: string[] = [];
    for (const [index, r] of corpus().all.entries()) {
      const seen = new Set<string>();
      const first = r.context.diagnosedAt;
      for (const task of r.payload.scores.plan.tasks) {
        const day =
          (Date.parse(task.date + "T00:00:00Z") -
            Date.parse(first + "T00:00:00Z")) /
            DAY_MS +
          1;
        if (day < 1 || day > 28 || day !== task.day) {
          problems.push("set " + index + " " + task.taskId + " day " + day);
        }
        for (const key of [task.taskId, task.doneId]) {
          if (key === undefined) continue;
          const id = key + "@" + task.date;
          if (seen.has(id)) problems.push("set " + index + " duplicate " + id);
          seen.add(id);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  // 98 r16 서비스 추천: always 2, care condition puts CALL first, no rank inversion
  it("r16 서비스 추천: always 2 cards, care puts CALL first, no rank inversion", () => {
    const problems: string[] = [];
    for (const [index, r] of corpus().all.entries()) {
      const { ranked, counselPinned } = r.payload.scores.services;
      const cards = r.payload.pages.p16.services;
      if (cards.length !== 2 || ranked.length !== 2)
        problems.push("count " + index);
      if (
        cards[0].code !== ranked[0].code ||
        cards[1].code !== ranked[1].code
      ) {
        problems.push("cards differ from ranking " + index);
      }
      if (counselPinned && ranked[0].code !== "CALL")
        problems.push("pin " + index);
      if (!counselPinned && ranked[0].fit < ranked[1].fit) {
        problems.push("inversion " + index);
      }
      if (ranked[0].code === ranked[1].code) problems.push("same " + index);
    }
    expect(problems).toEqual([]);
    expect(
      corpus().all.some((r) => r.payload.scores.services.counselPinned),
    ).toBe(true);
  });
});
