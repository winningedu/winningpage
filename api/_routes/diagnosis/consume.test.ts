// POST /api/diagnosis/consume 사이트별 소비.
// 스쿨멘토는 fn_consume_tenant_diagnosis 로 기관 한도에서 세고 같은 응답 코드로 옮긴다. 위닝은 그대로다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "../../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./consume.js";

const ATTEMPT = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";

let db: FakeDb;

const tenantRow = (over: Record<string, unknown> = {}) => ({
  allowed: true,
  deny_reason: null,
  month_used: 1,
  month_limit: 5,
  month_remaining: 4,
  term_used: 1,
  term_limit: null,
  term_remaining: null,
  month_resets_on: "2026-12-01",
  term_resets_on: null,
  ...over,
});

function setup(result: unknown, row: Record<string, unknown> = tenantRow()) {
  db = createFakeDb({
    rpcs: {
      fn_consume_tenant_diagnosis: () => result,
      fn_tenant_usage_state: () => [row],
      consume_diagnosis_attempt: () => ({
        status: "free_used",
        charged: false,
      }),
    },
  });
  const supabase = createFakeSupabase(db);
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  state.db = supabase;
}

const consume = () =>
  callHandler(
    handler as never,
    { attemptId: ATTEMPT },
    { authorization: "Bearer t" },
  );

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("diagnosis/consume 위닝", () => {
  test("consume_diagnosis_attempt 만 부르고 기관 함수는 부르지 않는다", async () => {
    vi.stubEnv("SITE", "winning");
    setup("consumed");
    const res = await consume();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: "free_used" });
    expect(db.rpcCalls.map((c) => c.name)).toEqual([
      "consume_diagnosis_attempt",
    ]);
  });
});

describe("diagnosis/consume 스쿨멘토", () => {
  beforeEach(() => vi.stubEnv("SITE", "schoolmentor"));

  test("consumed 는 charged 로 200 이고 남은 횟수를 준다", async () => {
    setup("consumed");
    const res = await consume();
    expect(db.rpcCalls[0]).toEqual({
      name: "fn_consume_tenant_diagnosis",
      args: { p_attempt_id: ATTEMPT, p_profile: "me" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: "charged",
      charged: true,
      quotaRemaining: 4,
      quotaTotal: 5,
      planEndsAt: "2026-12-01",
    });
  });

  test.each(["already_consumed", "already_recorded"])(
    "%s 는 already_recorded 로 200 이고 다시 세지 않는다",
    async (result) => {
      setup(result);
      const res = await consume();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        status: "already_recorded",
        charged: false,
      });
    },
  );

  test("attempt_conflict 는 409 ATTEMPT_CONFLICT", async () => {
    setup("attempt_conflict");
    const res = await consume();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "ATTEMPT_CONFLICT" }),
    });
  });

  test.each(["month_cap", "term_cap"])(
    "%s 는 409 QUOTA_EXHAUSTED 와 tenantReason",
    async (reason) => {
      setup(reason, tenantRow({ allowed: false, deny_reason: reason }));
      const res = await consume();
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        ok: false,
        error: expect.objectContaining({ code: "QUOTA_EXHAUSTED" }),
        tenantReason: reason,
      });
    },
  );

  test.each(["catch_all", "disabled"])(
    "%s 는 403 NO_ENTITLEMENT 와 tenantReason",
    async (reason) => {
      setup(reason);
      const res = await consume();
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        ok: false,
        error: expect.objectContaining({ code: "NO_ENTITLEMENT" }),
        tenantReason: reason,
      });
    },
  );

  test.each(["outside_period", "grace"])(
    "%s 는 403 ENTITLEMENT_EXPIRED 와 tenantReason",
    async (reason) => {
      setup(reason);
      const res = await consume();
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        ok: false,
        error: expect.objectContaining({ code: "ENTITLEMENT_EXPIRED" }),
        tenantReason: reason,
      });
    },
  );

  test("모르는 결과는 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup("weird");
    const res = await consume();
    expect(res.status).toBe(500);
  });
});
