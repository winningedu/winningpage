// GET /api/admin/service-credit-summary 계약 검증. 고객 한 명의 서비스별 이용횟수.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  problemCode,
  queriesOn,
  type Respond,
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
let profiles: Respond = () => ({
  data: { id: PID, name: "김학생", email: "kim@example.com" },
  error: null,
});

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "serviceCreditAdjust", level }] : [],
    tables: { profiles: (q) => profiles(q) },
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
  profiles = () => ({
    data: { id: PID, name: "김학생", email: "kim@example.com" },
    error: null,
  });
});

describe("GET /api/admin/service-credit-summary", () => {
  const get = (query: Record<string, string> = { profileId: PID }) =>
    callRoute(handler, { query });

  test("view 권한이면 ok 없이 { student, items } 를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as { items: Record<string, unknown>[] };
    expect(body).not.toHaveProperty("ok");
    expect(Object.keys(body).sort()).toEqual(["items", "student"]);
    expect((body as unknown as { student: unknown }).student).toEqual({
      id: PID,
      name: "김학생",
      email: "kim@example.com",
    });
    const read = queriesOn(admin, "profiles").find(
      (q) => argsOf(q, "select")?.[0] !== "role",
    );
    expect(argsOf(read as never, "eq")).toEqual(["id", PID]);
    expect(body.items).toHaveLength(6);
    expect(body.items[0]).toMatchObject({
      quotaTotal: 10,
      quotaUsed: 4,
      quotaRemaining: 6,
    });
    expect(admin.rpcCalls.every((c) => c.args.p_profile_id === PID)).toBe(true);
  });

  test("회원이 없으면 404 PROFILE_NOT_FOUND 이고 이용권을 읽지 않는다", async () => {
    const admin = setup();
    profiles = () => ({ data: null, error: null });
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("PROFILE_NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "회원을 찾을 수 없습니다.",
    );
    expect(
      admin.rpcCalls.some((c) => c.name === "fn_program_access_grants_summary"),
    ).toBe(false);
  });

  test("회원 조회 오류는 500 이다", async () => {
    setup();
    profiles = () => ({ data: null, error: { message: "boom" } });
    expect((await get()).status).toBe(500);
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
