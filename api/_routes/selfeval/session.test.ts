// POST /api/selfeval/session 의 이용 게이트와 생성 전 한도 확인(Hono 라우트를 루트 앱으로 부른다).
// 스쿨멘토는 기관 상태로 막고 tenantReason 을 싣는다. 위닝 응답에는 tenantReason 이 없다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
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

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/session" };

const CREATE_BODY = {
  action: "create",
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: "생명과학",
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: null, department: null, universities: [] },
  growthApplied: false,
};

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
          allowed: false,
          program_key: "selfeval",
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

const create = () => callRoute(route, { method: "POST", body: CREATE_BODY });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("selfeval/session 위닝", () => {
  test("이용권이 없으면 403 NO_ENTITLEMENT 이고 tenantReason 이 없다", async () => {
    vi.stubEnv("SITE", "winning");
    setup();
    const res = await create();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403, code: "NO_ENTITLEMENT" });
    expect(Object.keys(res.body as object)).not.toContain("ok");
    expect(Object.keys(res.body as object)).not.toContain("tenantReason");
  });
});

describe("selfeval/session 스쿨멘토", () => {
  beforeEach(() => vi.stubEnv("SITE", "schoolmentor"));

  test.each(["catch_all", "disabled", "outside_period", "grace"])(
    "%s 는 403 NO_ENTITLEMENT 와 tenantReason",
    async (reason) => {
      setup(tenantRow({ allowed: false, deny_reason: reason }));
      const res = await create();
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: "NO_ENTITLEMENT",
        tenantReason: reason,
      });
    },
  );

  test.each([
    ["month_cap", { month_limit: 3, month_remaining: 0 }],
    ["term_cap", { term_limit: 3, term_remaining: 0 }],
  ])(
    "%s 로 남은 횟수가 0 이면 생성 전에 409 QUOTA_EXHAUSTED 와 tenantReason",
    async (reason, extra) => {
      setup(tenantRow({ allowed: false, deny_reason: reason, ...extra }));
      const res = await create();
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        code: "QUOTA_EXHAUSTED",
        tenantReason: reason,
      });
    },
  );
});
