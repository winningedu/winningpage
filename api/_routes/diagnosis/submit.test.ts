// POST /api/diagnosis/submit: server-side scoring (judge-report 3-2).
// The engine is mocked here, it is built in parallel under src/lib/diagnosis-v3/.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CALC_EXAMPLE,
  validAnswers,
} from "../../../src/lib/diagnosis-v3/testFixtures.js";
import { callHandler } from "../../_lib/fakeSupabase.testkit.js";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ db: null as unknown }));
const engine = vi.hoisted(() => ({ score: vi.fn() }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

vi.mock("../../../src/lib/diagnosis-v3/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  scoreDiagnosisV3: engine.score,
}));

import handler from "./submit.js";

const ATTEMPT = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

type Setup = {
  attempt?: Row | null;
  report?: Row | null;
  /** row another request stored between our replay check and our insert */
  winner?: Row;
  profile?: Row | null;
  admission?: Row[];
  admissionError?: unknown;
};

// Fake query builder: eq/is record filters, awaiting resolves the table rows.
function setup(init: Setup = {}) {
  const attempt =
    init.attempt === undefined
      ? { profile_id: "me", kind: "free" }
      : init.attempt;
  const log = {
    upserts: [] as { row: Row; opts: unknown }[],
    admissionFilters: [] as [string, string, unknown][],
  };
  let report = init.report ?? null;
  state.db = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (col: string, value: unknown) => {
          if (table === "admission_results")
            log.admissionFilters.push(["eq", col, value]);
          return query;
        },
        is: (col: string, value: unknown) => {
          log.admissionFilters.push(["is", col, value]);
          return query;
        },
        maybeSingle: async () => {
          if (table === "diagnosis_attempts")
            return { data: attempt, error: null };
          if (table === "diagnosis_reports")
            return { data: report, error: null };
          if (table === "profiles")
            return { data: init.profile ?? null, error: null };
          return { data: null, error: null };
        },
        upsert: async (row: Row, opts: unknown) => {
          log.upserts.push({ row, opts });
          report ??= init.winner ?? {
            schema_version: row.schema_version,
            payload: row.payload,
          };
          return { error: null };
        },
        // biome-ignore lint/suspicious/noThenProperty: the real query builder is awaitable
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data: init.admission ?? [],
            error: init.admissionError ?? null,
          }),
      };
      return query;
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
  return log;
}

const post = (body: unknown) =>
  callHandler(handler as never, body, { authorization: "Bearer t" });

beforeEach(() => {
  engine.score.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("diagnosis/submit ownership and body", () => {
  test("attemptId that is not a uuid is 400 INVALID_BODY", async () => {
    setup();
    const res = await post({ attemptId: "nope", answers: {} });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_BODY" } });
  });

  test("answers that is not an object is 400 INVALID_BODY", async () => {
    setup();
    const res = await post({ attemptId: ATTEMPT, answers: [1] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_BODY" } });
  });

  test("oversized answers is 413 PAYLOAD_TOO_LARGE", async () => {
    setup();
    const res = await post({
      attemptId: ATTEMPT,
      answers: { big: "x".repeat(600 * 1024) },
    });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  test("missing attempt is 404 ATTEMPT_NOT_FOUND", async () => {
    setup({ attempt: null });
    const res = await post({ attemptId: ATTEMPT, answers: {} });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "ATTEMPT_NOT_FOUND" } });
  });

  test("attempt owned by someone else is 403 FORBIDDEN", async () => {
    setup({ attempt: { profile_id: "other", kind: "free" } });
    const res = await post({ attemptId: ATTEMPT, answers: {} });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("schoolmentor rejects an attempt that is not kind tenant", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    setup({ attempt: { profile_id: "me", kind: "free" } });
    const res = await post({ attemptId: ATTEMPT, answers: {} });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ATTEMPT_NOT_COUNTED" } });
  });
});

describe("diagnosis/submit replay and validation", () => {
  test("an existing report is returned unchanged without calling the engine", async () => {
    setup({ report: { schema_version: "2026-11-v3", payload: { stored: 1 } } });
    const res = await post({ attemptId: ATTEMPT, answers: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      schemaVersion: "2026-11-v3",
      payload: { stored: 1 },
    });
    expect(engine.score).not.toHaveBeenCalled();
  });

  test("answers that fail validateAnswers are 400 INVALID_ANSWERS with errors", async () => {
    setup();
    const res = await post({ attemptId: ATTEMPT, answers: {} });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: "INVALID_ANSWERS" },
      errors: expect.arrayContaining([{ question: "q1", reason: "missing" }]),
    });
    expect(engine.score).not.toHaveBeenCalled();
  });
});

describe("diagnosis/submit scoring", () => {
  const payload = { engine: "payload" };
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-11-09 01:00 in Seoul is still 2026-11-08 in UTC: the date follows the member zone.
    vi.setSystemTime(new Date("2026-11-08T16:00:00Z"));
    engine.score.mockReturnValue(payload);
  });
  afterEach(() => vi.useRealTimers());

  const cutRow = (over: Row) => ({
    result_year: 2025,
    university_name: "U",
    department_name: "D",
    admission_track: "T",
    grade_50: 1.5,
    grade_70: 1.9,
    competition_rate: 7.5,
    variant_seq: 0,
    ...over,
  });

  test("scores with the member-zone date, profile inputs and the fetched cut", async () => {
    const log = setup({
      profile: {
        name: " 홍길동 ",
        created_at: "2026-10-31T16:30:00Z",
        time_zone: "Asia/Seoul",
      },
      admission: [
        cutRow({ result_year: 2024, grade_50: 9 }),
        cutRow({ result_year: 2025, variant_seq: 1, grade_50: 8 }),
        cutRow({ result_year: 2025 }),
        cutRow({ result_year: 2026, grade_50: null, grade_70: null }),
      ],
    });
    const res = await post({ attemptId: ATTEMPT, answers: CALC_EXAMPLE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      schemaVersion: "2026-11-v3",
      payload,
    });
    expect(engine.score).toHaveBeenCalledWith(CALC_EXAMPLE, {
      diagnosedAt: "2026-11-09",
      joinedAt: "2026-11-01",
      studentName: "홍길동",
      admission: {
        cut50: 1.5,
        cut70: 1.9,
        competitionRate: 7.5,
        universityName: "U",
        unitName: "D",
        typeName: "T",
        year: 2025,
      },
    });
    expect(log.admissionFilters).toContainEqual([
      "is",
      "subject_reflection",
      null,
    ]);
    expect(log.upserts).toHaveLength(1);
    expect(log.upserts[0]?.opts).toMatchObject({
      onConflict: "attempt_id",
      ignoreDuplicates: true,
    });
    expect(log.upserts[0]?.row).toEqual({
      attempt_id: ATTEMPT,
      profile_id: "me",
      schema_version: "2026-11-v3",
      diagnosed_at: "2026-11-09",
      snapshot: {
        answers: CALC_EXAMPLE,
        context: engine.score.mock.calls[0]?.[1],
      },
      payload,
    });
  });

  test("diagnosedAt is the member's local day in profiles.time_zone", async () => {
    vi.setSystemTime(new Date("2026-05-31T15:30:00Z"));
    const answers = {
      ...validAnswers("M3"),
      q13: [{ kind: "PERF", date: "2026-06-20" }],
    };
    setup({ profile: { name: "A", time_zone: "Asia/Seoul" } });
    await post({ attemptId: ATTEMPT, answers });
    expect(engine.score.mock.calls[0]?.[1]).toMatchObject({
      diagnosedAt: "2026-06-01",
    });

    engine.score.mockClear();
    setup({ profile: { name: "A", time_zone: "America/Los_Angeles" } });
    await post({ attemptId: ATTEMPT, answers });
    expect(engine.score.mock.calls[0]?.[1]).toMatchObject({
      diagnosedAt: "2026-05-31",
    });
  });

  test("joinedAt is the day of created_at in the member zone", async () => {
    setup({
      profile: {
        name: "A",
        time_zone: "America/Los_Angeles",
        created_at: "2026-11-01T03:00:00Z",
      },
    });
    await post({ attemptId: ATTEMPT, answers: validAnswers("M3") });
    expect(engine.score.mock.calls[0]?.[1]).toMatchObject({
      joinedAt: "2026-10-31",
    });
  });

  test("a track without q15 skips the admission query", async () => {
    setup();
    const res = await post({ attemptId: ATTEMPT, answers: validAnswers("M3") });
    expect(res.status).toBe(200);
    expect(engine.score.mock.calls[0]?.[1]).toMatchObject({
      admission: null,
      joinedAt: null,
      studentName: null,
    });
  });

  test("no row with a cut gives admission null", async () => {
    setup({ admission: [cutRow({ grade_50: null, grade_70: null })] });
    await post({ attemptId: ATTEMPT, answers: CALC_EXAMPLE });
    expect(engine.score.mock.calls[0]?.[1]).toMatchObject({ admission: null });
  });

  test("a failed cut query is 500 and nothing is stored", async () => {
    const log = setup({ admissionError: { message: "boom" } });
    const res = await post({ attemptId: ATTEMPT, answers: CALC_EXAMPLE });
    expect(res.status).toBe(500);
    expect(log.upserts).toHaveLength(0);
  });

  test("the response is the stored row, so a racing submit returns the winner", async () => {
    setup({
      winner: { schema_version: "2026-11-v3", payload: { winner: 1 } },
    });
    const res = await post({ attemptId: ATTEMPT, answers: CALC_EXAMPLE });
    expect(res.body).toMatchObject({ payload: { winner: 1 } });
  });
});
