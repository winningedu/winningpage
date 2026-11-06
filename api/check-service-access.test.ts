// POST /api/check-service-access 의 사이트별 응답.
// 위닝은 기존 5필드 그대로, 스쿨멘토는 기관 상태로 판정하고 tenantReason 과 limitKind 를 더한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "./_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./check-service-access.js";

let db: FakeDb;

const tenantRow = (over: Record<string, unknown> = {}) => ({
  allowed: true,
  deny_reason: null,
  month_used: 0,
  month_limit: null,
  month_remaining: null,
  term_used: 0,
  term_limit: null,
  term_remaining: null,
  month_resets_on: "2026-12-01",
  term_resets_on: null,
  ...over,
});

function setup(row: Record<string, unknown> = tenantRow()) {
  db = createFakeDb({
    rpcs: {
      fn_tenant_usage_state: () => [row],
      fn_program_access_state: () => [
        {
          allowed: true,
          program_key: "growth",
          reason: null,
          expires_at: null,
        },
      ],
    },
  });
  const supabase = createFakeSupabase(db);
  // 위닝 경로의 findProgramAccessRow 가 .in 을 쓴다(testkit 에 없어 여기서만 덧붙인다).
  const baseFrom = supabase.from;
  supabase.from = (table: string) =>
    Object.assign(baseFrom(table), { in: () => baseFrom(table) });
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  state.db = supabase;
}

const check = (service_key = "growth") =>
  callHandler(handler as never, { service_key }, { authorization: "Bearer t" });

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("check-service-access 위닝", () => {
  test("응답 키는 기존 5개 그대로이고 기관 상태를 읽지 않는다", async () => {
    vi.stubEnv("SITE", "winning");
    setup();
    const res = await check();
    expect(Object.keys(res.body as object).sort()).toEqual([
      "allowed",
      "planEndsAt",
      "planLabel",
      "quotaRemaining",
      "quotaTotal",
    ]);
    expect(db.rpcCalls.map((c) => c.name)).not.toContain(
      "fn_tenant_usage_state",
    );
  });
});

describe("check-service-access 스쿨멘토", () => {
  beforeEach(() => vi.stubEnv("SITE", "schoolmentor"));

  test("허용이고 한도가 없으면 무제한과 null 사유", async () => {
    setup();
    const res = await check();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      allowed: true,
      quotaRemaining: null,
      quotaTotal: null,
      planEndsAt: null,
      planLabel: null,
      tenantReason: null,
      limitKind: null,
    });
  });

  test.each(["catch_all", "disabled", "outside_period", "grace"])(
    "%s 는 allowed false 와 같은 tenantReason",
    async (reason) => {
      setup(tenantRow({ allowed: false, deny_reason: reason }));
      const res = await check();
      expect(res.body).toMatchObject({ allowed: false, tenantReason: reason });
    },
  );

  test("월 한도 소진은 allowed true 이고 tenantReason month_cap, limitKind month, 초기화일을 준다", async () => {
    setup(
      tenantRow({
        allowed: false,
        deny_reason: "month_cap",
        month_limit: 3,
        month_remaining: 0,
        month_used: 3,
      }),
    );
    const res = await check();
    expect(res.body).toMatchObject({
      allowed: true,
      quotaRemaining: 0,
      quotaTotal: 3,
      planEndsAt: "2026-12-01",
      tenantReason: "month_cap",
      limitKind: "month",
    });
  });

  test("학기 한도 소진은 limitKind term", async () => {
    setup(
      tenantRow({
        allowed: false,
        deny_reason: "term_cap",
        term_limit: 10,
        term_remaining: 0,
        term_used: 10,
        term_resets_on: "2027-03-01",
      }),
    );
    const res = await check();
    expect(res.body).toMatchObject({
      allowed: true,
      quotaRemaining: 0,
      planEndsAt: "2027-03-01",
      tenantReason: "term_cap",
      limitKind: "term",
    });
  });

  test("목표관리는 program_key target 으로 읽는다", async () => {
    setup();
    await check("goal");
    expect(db.rpcCalls[0]).toEqual({
      name: "fn_tenant_usage_state",
      args: { p_profile: "me", p_program_key: "target" },
    });
  });

  test("기관 상태를 읽지 못하면 allowed false", async () => {
    setup();
    db.rpcs.fn_tenant_usage_state = () => {
      throw new Error("boom");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await check();
    expect(res.body).toMatchObject({ allowed: false, tenantReason: null });
  });
});
