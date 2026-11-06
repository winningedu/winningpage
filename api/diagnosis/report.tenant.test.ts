// 스쿨멘토 학습진단 한도는 서버가 집행한다. fn_consume_tenant_diagnosis 가 센 시도(kind tenant)
// 가 아니면 리포트를 저장하지 않는다. 위닝 동작은 그대로다.

import { afterEach, describe, expect, test, vi } from "vitest";
import { callHandler } from "../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./report.js";

const ATTEMPT = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

function setup(attempt: Record<string, unknown> | null) {
  const upserts: unknown[] = [];
  state.db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: attempt, error: null }),
        }),
      }),
      upsert: async (row: unknown) => {
        if (table === "diagnosis_reports") upserts.push(row);
        return { error: null };
      },
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
  return upserts;
}

const post = () =>
  callHandler(
    handler as never,
    {
      attemptId: ATTEMPT,
      snapshot: {},
      payload: {},
      schemaVersion: "2026-08-fd2",
      diagnosedAt: "2026-11-06T00:00:00.000Z",
    },
    { authorization: "Bearer t" },
  );

afterEach(() => vi.unstubAllEnvs());

describe("diagnosis/report 스쿨멘토 서버 집행", () => {
  test("센 시도(kind tenant)가 아니면 저장하지 않고 403", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const upserts = setup({ profile_id: "me", kind: "free" });
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ATTEMPT_NOT_COUNTED" } });
    expect(upserts).toHaveLength(0);
  });

  test("센 시도(kind tenant)는 저장한다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const upserts = setup({ profile_id: "me", kind: "tenant" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
  });

  test("위닝은 kind 를 따지지 않고 저장한다", async () => {
    vi.stubEnv("SITE", "winning");
    const upserts = setup({ profile_id: "me", kind: "free" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
  });
});
