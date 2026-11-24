// GET /api/admin/service-credit-summary 계약 검증. 고객 한 명의 서비스별 이용횟수.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callRoute,
  createAdminFake,
  problemCode,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

import handler from "./service-credit-summary.js";

const PID = "223e4567-e89b-42d3-a456-426614174000";

let summaryError: unknown = null;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "serviceCreditAdjust", level }] : [],
    rpcs: {
      fn_program_access_grants_summary: () => ({
        data: [
          {
            live_count: 1,
            quota_total: 10,
            quota_used: 4,
            expires_at: null,
            unlimited_period: false,
          },
        ],
        error: summaryError,
      }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  summaryError = null;
});

describe("GET /api/admin/service-credit-summary", () => {
  const get = (query: Record<string, string> = { profileId: PID }) =>
    callRoute(handler, { query });

  test("view 권한이면 ok 없이 { items } 를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as { items: Record<string, unknown>[] };
    expect(body).not.toHaveProperty("ok");
    expect(Object.keys(body)).toEqual(["items"]);
    expect(body.items).toHaveLength(6);
    expect(body.items[0]).toMatchObject({
      quotaTotal: 10,
      quotaUsed: 4,
      quotaRemaining: 6,
    });
    expect(admin.rpcCalls.every((c) => c.args.p_profile_id === PID)).toBe(true);
  });

  test("edit 권한도 읽는다", async () => {
    setup("edit");
    expect((await get()).status).toBe(200);
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("profileId 가 없거나 uuid 가 아니면 400 이다", async () => {
    setup();
    for (const query of [{}, { profileId: "x" }]) {
      const r = await get(query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    }
  });

  test("POST 는 405 다", async () => {
    setup();
    const r = await callRoute(handler, { method: "POST" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
  });

  test("DB 오류는 500 이다", async () => {
    setup();
    summaryError = { message: "boom" };
    expect((await get()).status).toBe(500);
  });
});
