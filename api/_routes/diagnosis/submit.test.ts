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
};

function setup(init: Setup = {}) {
  const attempt =
    init.attempt === undefined
      ? { profile_id: "me", kind: "free" }
      : init.attempt;
  state.db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "diagnosis_attempts" ? attempt : null,
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
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
