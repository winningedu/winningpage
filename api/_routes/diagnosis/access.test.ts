// POST /api/diagnosis/access 사이트별 판정.
// 위닝은 무료 1회와 이용권으로, 스쿨멘토는 무료 1회 없이 기관 설정과 한도로만 판정한다.

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

import handler from "./access.js";

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
    tables: { diagnosis_attempts: [] },
    rpcs: {
      fn_tenant_usage_state: () => [row],
      fn_program_access_state: () => [
        {
          allowed: false,
          program_key: "diagnose",
          reason: null,
          expires_at: null,
        },
      ],
    },
  });
  const supabase = createFakeSupabase(db);
  const baseFrom = supabase.from;
  supabase.from = (table: string) =>
    Object.assign(baseFrom(table), { in: () => baseFrom(table) });
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  state.db = supabase;
}

const access = () =>
  callHandler(handler as never, {}, { authorization: "Bearer t" });

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("diagnosis/access 위닝", () => {
  test("무료 1회가 남아 있으면 허용하고 기관 상태는 읽지 않는다", async () => {
    vi.stubEnv("SITE", "winning");
    setup();
    const res = await access();
    expect(res.body).toEqual({
      allowed: true,
      freeAvailable: true,
      quotaRemaining: null,
      quotaTotal: null,
      planEndsAt: null,
    });
    expect(db.rpcCalls.map((c) => c.name)).not.toContain(
      "fn_tenant_usage_state",
    );
  });
});

describe("diagnosis/access 스쿨멘토", () => {
  beforeEach(() => vi.stubEnv("SITE", "schoolmentor"));

  test("무료 1회를 주지 않고 기관이 허용하면 허용한다", async () => {
    setup();
    const res = await access();
    expect(res.body).toEqual({
      allowed: true,
      freeAvailable: false,
      quotaRemaining: null,
      quotaTotal: null,
      planEndsAt: null,
      tenantReason: null,
    });
  });

  test.each(["catch_all", "disabled", "outside_period", "grace"])(
    "%s 는 막고 tenantReason 을 준다",
    async (reason) => {
      setup(tenantRow({ allowed: false, deny_reason: reason }));
      const res = await access();
      expect(res.body).toMatchObject({
        allowed: false,
        freeAvailable: false,
        tenantReason: reason,
      });
    },
  );

  test.each([
    ["month_cap", { month_limit: 3, month_remaining: 0 }],
    ["term_cap", { term_limit: 3, term_remaining: 0 }],
  ])("%s 는 시작 지점이라 여기서 막는다", async (reason, extra) => {
    setup(tenantRow({ allowed: false, deny_reason: reason, ...extra }));
    const res = await access();
    expect(res.body).toMatchObject({
      allowed: false,
      quotaRemaining: 0,
      tenantReason: reason,
    });
  });
});
