// POST /api/diagnosis/submit: server-side scoring (judge-report 3-2).
// The engine is mocked here, it is built in parallel under src/lib/diagnosis-v3/.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
          report ??= {
            schema_version: row.schema_version,
            payload: row.payload,
          };
          return { error: null };
        },
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
