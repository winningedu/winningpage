// Deterministic sweep over the whole engine: mirrors 98_전수검증 r11-r17 on
// seeded pseudo-random answer sets built through the same option tables.

import { describe, expect, it, vi } from "vitest";
import {
  AREAS,
  type AreaCode,
  TRACK_CODES,
  TRACK_NAMES,
  type TrackCode,
} from "./codes.js";
import {
  type DiagnosisV3Answers,
  type DiagnosisV3Context,
  type DiagnosisV3Payload,
  type ScheduleEvent,
  scoreDiagnosisV3,
  validateAnswers,
} from "./index.js";
import type { Likert } from "./likert.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS, trackOf } from "./options.js";
import { AREA_STATE_LABELS, areaState } from "./scoring.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";
import { SCORE_SHEETS } from "./source/scoreSheets.js";

vi.setConfig({ testTimeout: 60_000 });

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

type GenOptions = {
  readonly likert?: LikertMode;
  /** force the q1 ordinal */
  readonly grade?: number;
  /** false drops every optional question */
  readonly optional?: boolean;
  /** events to send as q13, replaces the random draw */
  readonly events?: DiagnosisV3Answers["q13"];
  readonly diagnosedAt?: string;
  /** force the grade system, school and mock subject grades, 7-1 and 7-2 */
  readonly q4?: number;
  readonly q6s?: Readonly<Record<string, number>>;
  readonly q6m?: { month: number; grades: Readonly<Record<string, number>> };
  readonly q8?: number;
  readonly q8s?: number;
  readonly q8d?: number;
  /** force these ordinals as the q10, q12 and q14 picks */
  readonly q10?: readonly number[];
  readonly q12?: readonly number[];
  readonly q14?: readonly number[];
};

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
/** Mock exam grades are whole 9-grade numbers (validate.ts q6m). */
const mockGrade = (rng: Rng) => 1 + int(rng, 9);

const EVENT_KIND_ORDINALS = OPTIONS.q13
  .map((o) => String(o.code).slice("EVENT:".length))
  .filter((kind) => kind !== "NONE" && kind !== "UNKNOWN") as (
  | "EXAM"
  | "PERF"
  | "MOCK"
  | "APPLY"
  | "ETC"
)[];

/** n events with distinct (kind, date); same-day twins are covered on their own below. */
const drawEvents = (rng: Rng, n: number, diagnosedAt: string) => {
  const events = new Map<string, ScheduleEvent>();
  for (let i = 0; i < n; i++) {
    const kind = pick(rng, EVENT_KIND_ORDINALS);
    const date = addDays(diagnosedAt, int(rng, 42));
    events.set(kind + "@" + date, {
      kind,
      date,
      ...(chance(rng, 0.5) ? { subject: "SUBJ" } : {}),
    });
  }
  return [...events.values()];
};

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
  const q4 = options.q4 ?? pick(rng, OPTIONS.q4).ordinal;
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
          KOR: mockGrade(rng),
          MATH: mockGrade(rng),
          HIST: mockGrade(rng),
        },
      };
    }
    if (chance(rng, 0.7)) {
      raw.q8 = pick(rng, OPTIONS.q8).ordinal;
      if (chance(rng, 0.7)) raw.q8s = pick(rng, OPTIONS.q8s).ordinal;
      if (chance(rng, 0.7)) raw.q8d = pick(rng, OPTIONS.q8d).ordinal;
    }
    if (options.q6s) raw.q6s = options.q6s;
    if (options.q6m) raw.q6m = options.q6m;
    if (options.q8) raw.q8 = options.q8;
    if (options.q8s) raw.q8s = options.q8s;
    if (options.q8d) raw.q8d = options.q8d;
    raw.q10 = options.q10 ?? picks(rng, OPTIONS.q10, 3);
    raw.q12 = options.q12 ?? picks(rng, OPTIONS.q12[track], 3);
    raw.q14 = options.q14 ?? picks(rng, OPTIONS.q14, 2);
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
            : drawEvents(rng, dated - 2, diagnosedAt));
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
          excludedServices: [],
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

/**
 * Level sentences show for the lowest area of a page, so build sets where one
 * area sits at a chosen level and every other area at or above it, with and
 * without a difficulty check on that area (23 tie rule step 2).
 */
const buildAreaRuns = (): Run[] => {
  const rng = makeRng(SEED + 4);
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    const track = trackOf(grade);
    const areas = [
      ...SCALE_ITEMS.q9,
      ...SCALE_ITEMS.q20,
      ...SCALE_ITEMS.q11[track],
    ].map((item) => item.area);
    const rows = [...OPTIONS.q10, ...OPTIONS.q12[track]];
    for (const area of new Set(areas)) {
      const checkRows = rows.filter((o) => o.area === area);
      for (const others of [0, 1, 2, 3, 4] as const) {
        for (const own of [0, 1, 2, 3, 4] as const) {
          if (own > others) continue;
          const levels = Object.fromEntries(
            areas.map((code) => [code, code === area ? own : others]),
          );
          for (const checks of [0, 1, 2]) {
            const pickIn = (list: readonly { ordinal: number }[]) =>
              checkRows
                .slice(0, checks)
                .filter((row) => list.some((o) => o.ordinal === row.ordinal))
                .map((row) => row.ordinal);
            runs.push(
              run(
                generate(rng, {
                  grade,
                  likert: { kind: "levels", levels },
                  q10: pickIn(OPTIONS.q10),
                  q12: pickIn(OPTIONS.q12[track]),
                }),
              ),
            );
          }
        }
      }
    }
  }
  return runs;
};

/**
 * 07 r5-r14: for each service of the track, answer its mapped difficulty
 * items and Q14 hope items and keep its related areas low, so S1 to S3 tiers
 * of every service and track copy come up.
 */
const buildServiceRuns = (): Run[] => {
  const rng = makeRng(SEED + 6);
  const rows = (SCORE_SHEETS["07_서비스"] ?? []).filter(
    (row) => row.r >= 5 && row.r <= 14,
  );
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    const track = trackOf(grade);
    const areaCodes = [
      ...SCALE_ITEMS.q9,
      ...SCALE_ITEMS.q20,
      ...SCALE_ITEMS.q11[track],
    ];
    for (const row of rows) {
      if (row.c[2] !== "공통" && row.c[2] !== TRACK_NAMES[track]) continue;
      const options = row.c[3] === "Q10" ? OPTIONS.q10 : OPTIONS.q12[track];
      const designated = String(row.c[4]);
      const mapped = options
        .filter((o) =>
          designated.startsWith("항목")
            ? [...designated.matchAll(/(\d+)번/g)].some(
                (m) => Number(m[1]) === o.ordinal,
              )
            : o.area !== undefined &&
              designated.split(", ").includes(AREAS[o.area].label),
        )
        .map((o) => o.ordinal);
      const related = String(row.c[5]).split(", ");
      const hope = String(row.c[6]).split(",").map(Number);
      for (const checks of [1, 2, 3]) {
        for (const low of [0, 1, 2, 4] as const) {
          for (const wish of [false, true]) {
            const levels = Object.fromEntries(
              areaCodes.map((item) => [
                item.area,
                related.includes(AREAS[item.area as AreaCode].label) ? low : 4,
              ]),
            );
            const picked = mapped.slice(0, checks);
            runs.push(
              run(
                generate(rng, {
                  grade,
                  likert: { kind: "levels", levels },
                  q10: row.c[3] === "Q10" ? picked : [],
                  q12: row.c[3] === "Q10" ? [] : picked,
                  q14: wish ? hope.slice(0, 2) : [],
                }),
              ),
            );
          }
        }
      }
    }
  }
  return runs;
};

/** 22 r44: five school grades, some mock grades, 7-1 subject and 7-2 direction. */
const buildSubjectRuns = (): Run[] => {
  const rng = makeRng(SEED + 7);
  const subjects = ["KOR", "MATH", "ENG", "SOC", "SCI"] as const;
  const gradePool = [1, 1, 1, 2, 3, 5];
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.filter((o) => trackOf(o.ordinal) !== "M3")) {
    for (let i = 0; i < 120; i++) {
      const school = Object.fromEntries(
        subjects.map((s) => [s, pick(rng, gradePool)]),
      );
      const mock = Object.fromEntries(
        subjects
          .filter(() => chance(rng, 0.6))
          .map((s) => [s, pick(rng, gradePool)]),
      );
      runs.push(
        run(
          generate(rng, {
            grade: grade.ordinal,
            q4: 1,
            q6s: school,
            q6m: { month: 6, grades: mock },
            q8: pick(rng, OPTIONS.q8).ordinal,
            q8s: pick(rng, OPTIONS.q8s).ordinal,
            q8d: pick(rng, OPTIONS.q8d).ordinal,
          }),
        ),
      );
    }
  }
  return runs;
};

/** Temperament dimension levels drawn at random so the 17 rules can fire. */
const buildTemperamentRuns = (): Run[] => {
  const rng = makeRng(SEED + 5);
  const dims = ["NS", "HA", "RD", "PS", "SD", "CO", "ST"];
  const runs: Run[] = [];
  for (const grade of OPTIONS.q1.map((o) => o.ordinal)) {
    for (let i = 0; i < 250; i++) {
      const levels = Object.fromEntries(
        dims.map((dim) => [dim, int(rng, 5) as Likert]),
      );
      runs.push(
        run(generate(rng, { grade, likert: { kind: "levels", levels } })),
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
    const edge = [
      ...buildEdgeRuns(),
      ...buildLevelRuns(),
      ...buildCareRuns(),
      ...buildAreaRuns(),
      ...buildServiceRuns(),
      ...buildSubjectRuns(),
      ...buildTemperamentRuns(),
    ];
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
  it("includes the edge sets: all 매우, all 전혀, exclusive picks, no optional answers, events on Day 1, 28, 29 and 42", () => {
    const { all } = corpus();
    const lowest = (r: Run) => r.answers.q9.items.every((v) => v === 0);
    const highest = (r: Run) => r.answers.q9.items.every((v) => v === 4);
    expect(all.some(lowest)).toBe(true);
    expect(all.some(highest)).toBe(true);
    const exclusive = (
      ordinals: readonly number[] | undefined,
      rows: readonly { ordinal: number; exclusive: boolean }[],
    ) =>
      ordinals?.length === 1 &&
      rows.some((o) => o.ordinal === ordinals[0] && o.exclusive);
    expect(all.some((r) => exclusive(r.answers.q10, OPTIONS.q10))).toBe(true);
    expect(
      all.some((r) => exclusive(r.answers.q12, OPTIONS.q12[r.track])),
    ).toBe(true);
    expect(
      all.some(
        (r) => r.answers.q10 === undefined && r.answers.q13 === undefined,
      ),
    ).toBe(true);
    for (const day of EDGE_DAYS) {
      expect(
        all.some(
          (r) =>
            Array.isArray(r.answers.q13) &&
            r.answers.q13.some(
              (e) => e.date === addDays(r.context.diagnosedAt, day - 1),
            ),
        ),
      ).toBe(true);
    }
  });

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

  // 07 C16-C21 scope reaches the render layer, which picks the closed-site notice by it
  it("r16 scope: page 16 carries the service scope and a scope note exactly when it is not ALL", () => {
    for (const r of corpus().all) {
      const { p16 } = r.payload.pages;
      expect(p16.scope).toBe(r.payload.scores.services.scope);
      expect(p16.scopeNote !== undefined).toBe(p16.scope !== "ALL");
    }
  });

  // item 1: a site that excludes CALL never shows it; 1 card only where GOAL and CALL were the only candidates
  it("r16 closed site: with CALL excluded no CALL card, 2 cards except M3, N수 and 고3후기 which keep GOAL only", () => {
    const problems: string[] = [];
    for (const [index, r] of corpus().all.entries()) {
      const closed = scoreDiagnosisV3(r.answers, {
        ...r.context,
        excludedServices: ["CALL"],
      });
      const cards = closed.pages.p16.services;
      const scope = closed.scores.services.scope;
      if (cards.some((card) => card.code === "CALL"))
        problems.push("CALL " + index);
      if (closed.scores.services.counselPinned) problems.push("pin " + index);
      const expected = scope === "ALL" ? 2 : 1;
      if (cards.length !== expected) problems.push("count " + index);
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
        cards[1]?.code !== ranked[1]?.code
      ) {
        problems.push("cards differ from ranking " + index);
      }
      if (counselPinned && ranked[0].code !== "CALL")
        problems.push("pin " + index);
      if (!counselPinned && ranked[0].fit < (ranked[1]?.fit ?? 0)) {
        problems.push("inversion " + index);
      }
      if (ranked[0].code === ranked[1]?.code) problems.push("same " + index);
    }
    expect(problems).toEqual([]);
    expect(
      corpus().all.some((r) => r.payload.scores.services.counselPinned),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Copy reachability (98 r7, r8, r9, r17)
// ---------------------------------------------------------------------------

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let cachedText: string | undefined;
/** Every distinct page string and plan task text of the sweep, one per line. */
const sweepText = () => {
  if (cachedText === undefined) {
    const seen = new Set<string>();
    for (const r of corpus().all) {
      for (const text of pageStrings(r)) seen.add(text);
    }
    cachedText = [...seen].join("\n");
  }
  return cachedText;
};

/** True when the copy text of id, with {placeholders} as wildcards, is on some page. */
const isReached = (id: string) => {
  const text = COPY_TEXT[id];
  if (text === undefined) throw new Error("no copy " + id);
  // a "when|what" copy (ROAD_*) is shown as two page strings
  return text.split("|").every((part) => {
    const pattern = part
      .split(/\{[^{}]+\}/)
      .map(escapeRegExp)
      .join("[^\\n]*?");
    return new RegExp(pattern).test(sweepText());
  });
};

const unreached = (ids: readonly string[]) =>
  ids.filter((id) => !isReached(id));

describe("98_전수검증 reachability", () => {
  // 98 r7: 28 areas x 5 level sentences (03_영역문구 AREA_<area>_L1..L5)
  it("r7 경계 응답 영역 문장: 28 areas x 5 level sentences all appear (140 of 140)", () => {
    const ids = Object.keys(COPY_TEXT).filter((id) =>
      /^AREA_.+_L[1-5]$/.test(id),
    );
    expect(ids).toHaveLength(140);
    expect(new Set(ids.map((id) => id.replace(/_L[1-5]$/, ""))).size).toBe(28);
    expect(unreached(ids)).toEqual([]);
  });

  // 98 r8: 17 temperament rules (18_기질설정 r32-r48 T_*), through the fired rule ids
  it("r8 경계 응답 기질 규칙: each of the 17 temperament rules fires in some sweep set", () => {
    const rules = (SCORE_SHEETS["18_기질설정"] ?? [])
      .filter((row) => row.r >= 32 && row.r <= 48)
      .map((row) => String(row.c[1]).split(" \u00b7 ")[0] as string);
    expect(rules).toHaveLength(17);
    const fired = new Set<string>();
    for (const r of corpus().all) {
      for (const ids of Object.values(r.payload.scores.temperament.rules)) {
        for (const id of ids) fired.add(id);
      }
    }
    expect(rules.filter((id) => !fired.has(id))).toEqual([]);
    expect(unreached(rules)).toEqual([]);
  });

  // 98 r9: 6 services x tier x track copy (08_서비스문구 SVC_<code>_S1..S3[@고3 N수])
  it("r9 경계 응답 서비스 문구: every service x tier x track text appears", () => {
    const ids = Object.keys(COPY_TEXT).filter((id) =>
      /^SVC_(GOAL|PERF|DEEP|SELF|GROW|CALL)_S[1-3](@.+)?$/.test(id),
    );
    expect(ids.length).toBeGreaterThanOrEqual(18);
    expect(unreached(ids)).toEqual([]);
  });
});

// 98 r17 + 22_리포트요소 E: every copy id the report element sheet names appears
describe("98_전수검증 r17 문구 도달", () => {
  /** Placeholder words 22 E cells use inside ids (코드 = area code, n = digit, ...). */
  const PLACEHOLDERS = [
    "코드",
    "차원",
    "요소",
    "유형",
    "셀",
    "트랙",
    "학년",
    "상태",
    "라벨",
    "판정",
    "글자",
  ];
  /** 22 E cell codes that are not copy ids (goal matrix cells). */
  const CELL_CODES = /^[CE]_(IN|MIX|EX|NA)$/;

  /** Copy ids a 22 E cell names; placeholder words and a~b ranges expand over COPY_TEXT. */
  const namedIds = () => {
    const keys = Object.keys(COPY_TEXT);
    const ids = new Set<string>();
    const unmatched = new Set<string>();
    for (const row of SCORE_SHEETS["22_리포트요소"] ?? []) {
      const cell = String(row.c[4] ?? "");
      for (const [token] of cell.matchAll(
        /[A-Z][A-Z0-9]*(?:_[A-Za-z0-9~\uAC00-\uD7A3]+)+/g,
      )) {
        if (CELL_CODES.test(token)) continue;
        const range = token.match(/^(.*?)([A-Z]*)(\d+)~[A-Z]*(\d+)$/);
        const expanded = range
          ? Array.from(
              { length: Number(range[4]) - Number(range[3]) + 1 },
              (_, i) => `${range[1]}${range[2]}${Number(range[3]) + i}`,
            )
          : [token];
        for (const name of expanded) {
          const body = name
            .split("_")
            .map((part) => {
              if (part === "n") return "[0-9]+";
              if (part.endsWith("등급")) return part.slice(0, -2) + "[1-5]";
              if (part.endsWith("구간")) return part.slice(0, -2) + "[1-3]";
              if (/^[A-Z]+n$/.test(part)) return part.slice(0, -1) + "[0-9]+";
              if (PLACEHOLDERS.includes(part)) return ".+";
              return escapeRegExp(part);
            })
            .join("_");
          // a bare prefix such as AREA_코드_ACT or TEMP_METHOD names the whole id family
          const exact = new RegExp("^" + body + "$");
          const family = new RegExp("^" + body + "(_.+|[0-9]+)$");
          const found = keys.filter(
            (key) => exact.test(key) || family.test(key),
          );
          if (found.length === 0) unmatched.add(name);
          for (const key of found) ids.add(key);
        }
      }
    }
    return { ids: [...ids], unmatched: [...unmatched] };
  };

  /**
   * Copy ids 22 names that no input can print today (spec gaps, see the report):
   * - PLAN_MINLOAD_EST: 22 r105 shows it when 14번 (q21) is unanswered, but
   *   q21 is a required question (13 G), so that branch cannot occur.
   * Remove an id from this list when the engine or sheet starts printing it.
   */
  const KNOWN_UNREACHED = ["PLAN_MINLOAD_EST"];

  it("r17 문구 도달: every copy id named by 22_리포트요소 is reached by some sweep set", () => {
    const { ids, unmatched } = namedIds();
    expect(ids.length).toBeGreaterThan(300);
    // tokens of a 22 cell that are cell codes or template names, not copy ids
    expect(unmatched).toEqual([]);
    expect(unreached(ids)).toEqual(KNOWN_UNREACHED);
  });
});

// 98 r15: two events of one kind on one day must not print the same task
// twice. validateAnswers rejects such a pair, so the engine is fed directly.
describe("98_전수검증 r15 same-day twin events", () => {
  it("r15 같은 날 같은 종류 일정 두 개도 같은 과제를 두 번 내지 않는다", () => {
    const rng = makeRng(SEED + 8);
    const diagnosedAt = "2026-11-09";
    const duplicates: string[] = [];
    for (const kind of EVENT_KIND_ORDINALS) {
      const date = addDays(diagnosedAt, 6);
      const g = generate(rng, { grade: 3, diagnosedAt, events: "NONE" });
      const r = run({
        ...g,
        answers: {
          ...g.answers,
          q13: [
            { kind, date },
            { kind, date },
          ],
        },
      });
      const seen = new Set<string>();
      for (const task of r.payload.scores.plan.tasks) {
        const id = task.taskId + "@" + task.date;
        if (seen.has(id)) duplicates.push(id);
        seen.add(id);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
