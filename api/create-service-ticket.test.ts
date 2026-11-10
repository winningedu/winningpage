// POST /api/create-service-ticket 의 이용 거부 응답.
// 스쿨멘토 거부는 기존 403 detail 에 tenantReason 이 더해지고 위닝 거부는 detail 하나뿐이다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
} from "./_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => {
  process.env.GOAL_SERVICE_URL = "https://goal.example.com";
  return { db: null as unknown };
});

vi.mock("./_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./create-service-ticket.js";

function setup(denyReason: string, qaIds: string[] = []) {
  const db = createFakeDb({
    tables: { qa_accounts: qaIds.map((profile_id) => ({ profile_id })) },
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
          program_key: "target",
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
  callHandler(
    handler as never,
    { service_key: "goal" },
    { authorization: "Bearer t" },
  );

beforeEach(() => {
  vi.stubEnv("SSO_SECRET", "x".repeat(40));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("create-service-ticket 이용 거부", () => {
  test("스쿨멘토 거부는 403 detail 에 tenantReason 을 더한다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    setup("catch_all");
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      detail: "유료결제이후 이용해주세요!",
      tenantReason: "catch_all",
    });
  });

  test("위닝 거부는 detail 하나뿐이다", async () => {
    vi.stubEnv("SITE", "winning");
    setup("catch_all");
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ detail: "유료결제이후 이용해주세요!" });
  });

  test("QA 계정은 이용권 판정보다 먼저 막혀 입장권을 받지 못한다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    setup("catch_all", ["me"]);
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      detail: "QA 계정이라 이 기능은 작동하지 않아요.",
      code: "QA_ACCOUNT_RESTRICTED",
    });
  });
});
