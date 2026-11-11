// 수행평가 라우트의 이용 게이트 응답. 스쿨멘토 거부는 기존 403 NO_ENTITLEMENT 에 tenantReason 이 더해지고
// 위닝 거부는 이전과 같은 모양(tenantReason 없음)이다. session 라우트로 대표 확인한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./session.js";

function setup(denyReason: string) {
  const db = createFakeDb({
    rpcs: {
      fn_tenant_usage_state: () => [
        {
          allowed: false,
          deny_reason: denyReason,
          month_used: 0,
          month_limit: null,
          month_remaining: null,
          term_used: 0,
          term_limit: null,
          term_remaining: null,
          month_resets_on: "2026-12-01",
          term_resets_on: null,
        },
      ],
      fn_program_access_state: () => [
        {
          allowed: false,
          program_key: "suhaeng",
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

const call = () =>
  callHandler(handler as never, {}, { authorization: "Bearer t" });

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("performance 이용 게이트", () => {
  test("스쿨멘토 catch_all 거부는 403 NO_ENTITLEMENT 와 tenantReason", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    setup("catch_all");
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "NO_ENTITLEMENT" },
      tenantReason: "catch_all",
    });
  });

  test("위닝 거부는 같은 403 이고 tenantReason 이 없다", async () => {
    vi.stubEnv("SITE", "winning");
    setup("catch_all");
    const res = await call();
    expect(res.status).toBe(403);
    expect(Object.keys(res.body as object)).toEqual(["error"]);
  });
});
