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

const QUOTA = {
  quotaTotal: 5,
  quotaUsed: 1,
  quotaRemaining: 4,
  planEndsAt: null,
  planLabel: "수동 부여",
};

vi.mock("../../_lib/serviceAccess.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/serviceAccess.js")>()),
  findProgramAccessRow: vi.fn(async () => null),
  readQuotaSnapshot: vi.fn(async () => QUOTA),
}));

import { inquiryGrantResultSchema } from "../../../shared/inquiry-ops/contract.js";
import { app } from "../app.js";

const route = { app, path: "/api/admin/inquiry-grant" };

const PROFILE = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const GRANT_ID = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

let profiles: Respond;
let grants: Respond;
let syncError: unknown;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "inquirySessions", level }] : [],
    tables: {
      profiles: (q) => profiles(q),
      program_access_grants: (q) => grants(q),
    },
    rpcs: { fn_sync_program_access_cache: () => ({ error: syncError }) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  profiles = () => ({
    data: { id: PROFILE, member_type: "student" },
    error: null,
  });
  grants = () => ({ data: { id: GRANT_ID }, error: null });
  syncError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const BODY = { profileId: PROFILE, sessionQuota: 5 };
const post = (body: unknown = BODY) =>
  callRoute(route, { method: "POST", body });

const GRANT_KEYS = [
  "granted_by",
  "granted_by_actor",
  "granted_months",
  "granted_sessions",
  "expires_at",
  "memo",
  "paid_amount",
  "profile_id",
  "program_key",
  "starts_at",
  "validity_days",
].sort();

describe("POST /api/admin/inquiry-grant", () => {
  test("edit 권한이면 부여 행을 넣고 캐시를 맞춘 뒤 ok 없이 grantId 와 quota 를 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toEqual({ grantId: GRANT_ID, quota: QUOTA });
    expect(inquiryGrantResultSchema.safeParse(r.body).success).toBe(true);
    const row = argsOf(
      firstQuery(admin, "program_access_grants"),
      "insert",
    )?.[0];
    expect(Object.keys(row as object).sort()).toEqual(GRANT_KEYS);
    expect(row).toMatchObject({
      profile_id: PROFILE,
      program_key: "inquiry",
      granted_by: "admin",
      granted_by_actor: "admin-1",
    });
    expect(admin.rpcCalls.map((c) => c.name)).toContain(
      "fn_sync_program_access_cache",
    );
  });

  test("본문에 정의되지 않은 키가 있으면 400 VALIDATION_FAILED 이고 넣지 않는다 (strict)", async () => {
    const admin = setup();
    const r = await post({
      ...BODY,
      paid_amount: 100000,
      granted_by: "payment",
      granted_by_actor: "someone",
    });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "program_access_grants",
    );
  });

  test.each([
    [
      "sessionQuota 가 0",
      { ...BODY, sessionQuota: 0 },
      "sessionQuota 는 1 이상의 정수 또는 null(무제한)이어야 합니다.",
    ],
    [
      "무제한인데 endsAt 없음",
      { ...BODY, sessionQuota: null },
      "무제한 부여는 만료일이 필요합니다.",
    ],
    [
      "endsAt 이 startsAt 이전",
      {
        ...BODY,
        startsAt: "2027-01-02T00:00:00Z",
        endsAt: "2027-01-01T00:00:00Z",
      },
      "endsAt 은 startsAt 보다 늦어야 합니다.",
    ],
  ])(
    "%s 이면 400 INVALID_BODY 와 기존 사유다",
    async (_label, body, reason) => {
      const admin = setup();
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("INVALID_BODY");
      expect((r.body as { detail: string }).detail).toBe(reason);
      expect(admin.queries.map((q) => q.table)).not.toContain(
        "program_access_grants",
      );
    },
  );

  test("무제한(null)과 endsAt 이 있으면 부여한다", async () => {
    const admin = setup();
    const r = await post({
      ...BODY,
      sessionQuota: null,
      endsAt: "2099-01-01T00:00:00Z",
    });
    expect(r.status).toBe(200);
    expect(
      argsOf(firstQuery(admin, "program_access_grants"), "insert")?.[0],
    ).toMatchObject({
      granted_sessions: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    });
  });

  test("sessionQuota 키가 없으면 400 VALIDATION_FAILED 다", async () => {
    setup();
    const r = await post({ profileId: PROFILE });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test("profileId 가 uuid 가 아니면 400 INVALID_BODY 다", async () => {
    const admin = setup();
    const r = await post({ ...BODY, profileId: "abc" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_BODY");
    expect((r.body as { detail: string }).detail).toBe(
      "profileId 가 올바르지 않습니다.",
    );
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "program_access_grants",
    );
  });

  test("없는 회원은 404 PROFILE_NOT_FOUND 다", async () => {
    const admin = setup();
    profiles = () => ({ data: null, error: null });
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("PROFILE_NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "회원을 찾을 수 없습니다.",
    );
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "program_access_grants",
    );
  });

  test("학생이 아니면 400 NOT_STUDENT 다", async () => {
    const admin = setup();
    profiles = () => ({
      data: { id: PROFILE, member_type: "parent" },
      error: null,
    });
    const r = await post();
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("NOT_STUDENT");
    expect((r.body as { detail: string }).detail).toBe(
      "학생 회원에게만 부여할 수 있습니다.",
    );
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "program_access_grants",
    );
  });

  test("view 권한으로는 403 FORBIDDEN 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "program_access_grants",
    );
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("GET 은 405 METHOD_NOT_ALLOWED 다", async () => {
    setup();
    const r = await callRoute(route, { method: "GET" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("POST");
  });

  test("insert 오류는 500 INTERNAL_ERROR 이고 문구는 그대로다", async () => {
    setup();
    grants = () => ({ data: null, error: { message: "boom" } });
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
    expect((r.body as { detail: string }).detail).toBe(
      "심화탐구 이용권 부여에 실패했습니다.",
    );
  });

  test("캐시 동기화 오류는 500 이다", async () => {
    setup();
    syncError = { message: "boom" };
    const r = await post();
    expect(r.status).toBe(500);
  });
});
