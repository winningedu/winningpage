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

type StoredReport = Record<string, unknown>;

// existing 이 있으면 그 attempt 의 리포트가 이미 저장된 상태다(attempt_id 유일).
function setup(
  attempt: Record<string, unknown> | null,
  existing: StoredReport | null = null,
) {
  const writes = { inserts: [] as unknown[], upserts: [] as unknown[] };
  state.db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "diagnosis_reports" ? existing : attempt,
            error: null,
          }),
        }),
      }),
      insert: async (row: unknown) => {
        if (table !== "diagnosis_reports") return { error: null };
        if (existing) return { error: { code: "23505" } };
        writes.inserts.push(row);
        return { error: null };
      },
      upsert: async (row: unknown) => {
        if (table === "diagnosis_reports") writes.upserts.push(row);
        return { error: null };
      },
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
  return writes;
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

const SAME = {
  schema_version: "2026-08-fd2",
  diagnosed_at: "2026-11-06T00:00:00+00:00",
  snapshot: {},
  payload: {},
};

describe("diagnosis/report 스쿨멘토 서버 집행", () => {
  test("센 시도(kind tenant)가 아니면 저장하지 않고 403", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const w = setup({ profile_id: "me", kind: "free" });
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ATTEMPT_NOT_COUNTED" } });
    expect(w.inserts).toHaveLength(0);
    expect(w.upserts).toHaveLength(0);
  });

  test("센 시도(kind tenant)의 첫 저장은 덮어쓰기 없이 새로 넣는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const w = setup({ profile_id: "me", kind: "tenant" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(w.inserts).toHaveLength(1);
    expect(w.upserts).toHaveLength(0);
  });

  test("이미 리포트가 있는 시도에 다른 진단을 보내면 409 로 거절하고 덮어쓰지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const w = setup(
      { profile_id: "me", kind: "tenant" },
      { ...SAME, payload: { other: "diagnosis" } },
    );
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "REPORT_ALREADY_SAVED" } });
    expect(w.upserts).toHaveLength(0);
  });

  test("같은 내용의 재전송(네트워크 재시도)은 200 으로 받아 준다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const w = setup({ profile_id: "me", kind: "tenant" }, { ...SAME });
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(w.upserts).toHaveLength(0);
  });

  test("위닝은 kind 를 따지지 않고 upsert 로 저장한다", async () => {
    vi.stubEnv("SITE", "winning");
    const w = setup(
      { profile_id: "me", kind: "free" },
      { ...SAME, payload: { a: 1 } },
    );
    const res = await post();
    expect(res.status).toBe(200);
    expect(w.upserts).toHaveLength(1);
    expect(w.inserts).toHaveLength(0);
  });
});
