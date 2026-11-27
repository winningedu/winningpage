// POST /api/admin/selfeval-grant 계약 검증. 자기평가서 이용권 수동 부여.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
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

import { selfevalGrantResultSchema } from "../../../shared/selfeval-ops/contract.js";
import { app } from "../app.js";

const route = { app, path: "/api/admin/selfeval-grant" };

const PID = "223e4567-e89b-42d3-a456-426614174000";

let profiles: Respond = () => ({
  data: { id: PID, member_type: "student" },
  error: null,
});
let grants: Respond = () => ({ data: { id: "grant-1" }, error: null });
let syncError: unknown = null;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "selfevalSessions", level }] : [],
    tables: {
      profiles: (q) => profiles(q),
      program_access_grants: (q) => grants(q),
      program_access: () => ({ data: null, error: null }),
    },
    rpcs: {
      fn_sync_program_access_cache: () => ({ data: null, error: syncError }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  profiles = () => ({ data: { id: PID, member_type: "student" }, error: null });
  grants = () => ({ data: { id: "grant-1" }, error: null });
  syncError = null;
});

describe("POST /api/admin/selfeval-grant", () => {
  const post = (
    body: unknown = { profileId: PID, sessionQuota: 3, months: 2 },
  ) => callRoute(route, { method: "POST", body });

  test("edit 권한이면 부여하고 ok 없이 { grantId, quota } 를 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const body = r.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("ok");
    expect(body.grantId).toBe("grant-1");
    expect(body).toHaveProperty("quota");
    expect(selfevalGrantResultSchema.safeParse(body).success).toBe(true);
    expect(admin.rpcCalls).toEqual([
      {
        name: "fn_sync_program_access_cache",
        args: { p_profile_id: PID, p_program_key: "selfeval" },
      },
    ]);
  });

  test("insert 는 라우트가 만드는 컬럼만 담고 클라이언트의 여분 키는 버린다", async () => {
    const admin = setup();
    const r = await post({
      profileId: PID,
      sessionQuota: 3,
      months: 2,
      granted_by: "payment",
      granted_by_actor: "someone",
      paid_amount: 99999,
      program_key: "growth",
      id: "x",
    });
    expect(r.status).toBe(200);
    const row = argsOf(
      firstQuery(admin, "program_access_grants"),
      "insert",
    )?.[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(
      [
        "expires_at",
        "granted_by",
        "granted_by_actor",
        "granted_months",
        "granted_sessions",
        "memo",
        "paid_amount",
        "profile_id",
        "program_key",
        "starts_at",
        "validity_days",
      ].sort(),
    );
    expect(row).toMatchObject({
      profile_id: PID,
      program_key: "selfeval",
      granted_by: "admin",
      granted_by_actor: "admin-1",
      granted_sessions: 3,
      granted_months: 2,
      paid_amount: 0,
    });
  });

  test("view 권한이면 403 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.some((q) => q.table === "program_access_grants")).toBe(
      false,
    );
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    expect((await post()).status).toBe(403);
  });

  test("본문 모양이 틀리면 400 VALIDATION_FAILED 다", async () => {
    setup();
    for (const body of [
      null,
      "x",
      { profileId: PID },
      { profileId: PID, sessionQuota: "3" },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    }
  });

  test("규칙 위반은 400 INVALID_BODY 다", async () => {
    setup();
    for (const body of [
      { profileId: "x", sessionQuota: 3 },
      { profileId: PID, sessionQuota: 0 },
      {
        profileId: PID,
        sessionQuota: 1,
        months: 1,
        endsAt: "2030-01-01T00:00:00Z",
      },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("INVALID_BODY");
    }
  });

  test("없는 회원은 404 PROFILE_NOT_FOUND 다", async () => {
    setup();
    profiles = () => ({ data: null, error: null });
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("PROFILE_NOT_FOUND");
    expect((r.body as { detail?: string }).detail).toBe(
      "회원을 찾을 수 없습니다.",
    );
  });

  test("학생이 아니면 400 NOT_STUDENT 다", async () => {
    const admin = setup();
    profiles = () => ({
      data: { id: PID, member_type: "parent" },
      error: null,
    });
    const r = await post();
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("NOT_STUDENT");
    expect((r.body as { detail?: string }).detail).toBe(
      "학생 회원에게만 부여할 수 있습니다.",
    );
    expect(admin.queries.some((q) => q.table === "program_access_grants")).toBe(
      false,
    );
  });

  test("캐시 동기화가 실패하면 500 이다", async () => {
    setup();
    syncError = { message: "boom" };
    expect((await post()).status).toBe(500);
  });
  test("GET 은 405 METHOD_NOT_ALLOWED 이고 Allow 는 POST 다", async () => {
    setup();
    const r = await callRoute(route, { method: "GET" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("POST");
  });
});
