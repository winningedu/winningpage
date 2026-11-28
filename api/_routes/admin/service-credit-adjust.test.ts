// POST /api/admin/service-credit-adjust 계약 검증. 서비스 이용횟수 수기 추가와 차감.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";
import { gateReads } from "../../_lib/gatedReads.testkit.js";

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

import { app } from "../app.js";

const handler = { app, path: "/api/admin/service-credit-adjust" };

const PID = "223e4567-e89b-42d3-a456-426614174000";

let profiles: Respond = () => ({
  data: { id: PID, member_type: "student", role: "user" },
  error: null,
});
let summary = {
  live_count: 1,
  quota_total: 10,
  quota_used: 4,
  expires_at: null as string | null,
  unlimited_period: false,
};
let deductStatus = "deducted";
let deductError: unknown = null;
let insertError: unknown = null;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "serviceCreditAdjust", level }] : [],
    tables: {
      profiles: (q) => profiles(q),
      program_access_grants: () => ({ data: null, error: insertError }),
    },
    rpcs: {
      fn_program_access_grants_summary: () => ({
        data: [summary],
        error: null,
      }),
      fn_admin_deduct_service_credit: () => ({
        data: { status: deductStatus },
        error: deductError,
      }),
      fn_sync_program_access_cache: () => ({ data: null, error: null }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  profiles = () => ({
    data: { id: PID, member_type: "student", role: "user" },
    error: null,
  });
  summary = {
    live_count: 1,
    quota_total: 10,
    quota_used: 4,
    expires_at: null,
    unlimited_period: false,
  };
  deductStatus = "deducted";
  deductError = null;
  insertError = null;
});

describe("POST /api/admin/service-credit-adjust", () => {
  const post = (
    body: unknown = {
      profileId: PID,
      programKey: "growth",
      delta: 3,
      reason: "보상 지급",
    },
  ) => callRoute(handler, { method: "POST", body });
  const deduct = (extra: Record<string, unknown> = {}) =>
    post({
      profileId: PID,
      programKey: "growth",
      delta: -2,
      reason: "오지급 회수",
      ...extra,
    });

  test("추가는 grant 행을 넣고 sync 한 뒤 ok 없이 { credit } 를 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const body = r.body as { credit: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(["credit"]);
    expect(body.credit).toMatchObject({ programKey: "growth", quotaTotal: 10 });
    expect(
      argsOf(firstQuery(admin, "program_access_grants"), "insert")?.[0],
    ).toMatchObject({
      profile_id: PID,
      program_key: "growth",
      granted_by: "admin",
      granted_by_actor: "admin-1",
      granted_sessions: 3,
      paid_amount: 0,
    });
    expect(admin.rpcCalls.map((c) => c.name)).toContain(
      "fn_sync_program_access_cache",
    );
  });

  test("insert 와 차감 rpc 에는 라우트가 만드는 키만 가고 클라이언트의 여분 키는 버린다", async () => {
    const admin = setup();
    const extra = {
      granted_by: "payment",
      paid_amount: 9999,
      granted_by_actor: "x",
      p_amount: 999,
    };
    await post({
      profileId: PID,
      programKey: "growth",
      delta: 3,
      reason: "보상 지급",
      ...extra,
    });
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
      granted_by: "admin",
      granted_by_actor: "admin-1",
      paid_amount: 0,
    });

    const admin2 = setup();
    await deduct(extra);
    const call = admin2.rpcCalls.find(
      (c) => c.name === "fn_admin_deduct_service_credit",
    );
    expect(call?.args).toEqual({
      p_profile_id: PID,
      p_program_key: "growth",
      p_amount: 2,
      p_reason: "관리자 이용횟수 조정(admin-1): 오지급 회수",
    });
  });

  test("차감은 rpc 로 원장에 남기고 sync 한다", async () => {
    const admin = setup();
    const r = await deduct();
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["credit"]);
    expect(admin.queries.some((q) => q.table === "program_access_grants")).toBe(
      false,
    );
    expect(admin.rpcCalls.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "fn_admin_deduct_service_credit",
        "fn_sync_program_access_cache",
      ]),
    );
  });

  test("view 권한이면 403 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.some((q) => q.table === "program_access_grants")).toBe(
      false,
    );
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test("GET 은 Allow 를 실은 405 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup();
    const r = await callRoute(handler, { method: "GET" });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("POST");
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(admin.rpcCalls).toHaveLength(0);
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    expect((await post()).status).toBe(403);
  });

  test("본문 모양이 틀리면 400 VALIDATION_FAILED 다", async () => {
    setup();
    for (const body of [
      null,
      {},
      { profileId: PID, programKey: "growth", delta: "3", reason: "xx" },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    }
  });

  test("규칙 위반은 400 INVALID_BODY 다", async () => {
    setup();
    for (const body of [
      { profileId: "x", programKey: "growth", delta: 1, reason: "보상 지급" },
      { profileId: PID, programKey: "nope", delta: 1, reason: "보상 지급" },
      { profileId: PID, programKey: "growth", delta: 0, reason: "보상 지급" },
      { profileId: PID, programKey: "growth", delta: 1, reason: "a" },
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

  test("학생도 관리자도 아니면 400 NOT_STUDENT 다", async () => {
    setup();
    profiles = () => ({
      data: { id: PID, member_type: "parent", role: "user" },
      error: null,
    });
    const r = await post();
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("NOT_STUDENT");
    expect((r.body as { detail?: string }).detail).toBe(
      "학생 또는 관리자 계정에만 조정할 수 있습니다.",
    );
  });

  test("차감할 이용권이 없으면 409 NO_ENTITLEMENT 다", async () => {
    const admin = setup();
    summary = { ...summary, live_count: 0 };
    const r = await deduct();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("NO_ENTITLEMENT");
    expect(
      admin.rpcCalls.some((c) => c.name === "fn_admin_deduct_service_credit"),
    ).toBe(false);
  });

  test("회차 무제한 이용권은 409 UNLIMITED_SESSIONS 다", async () => {
    setup();
    summary = { ...summary, quota_total: null as unknown as number };
    const r = await deduct();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("UNLIMITED_SESSIONS");
  });

  test("잔여보다 많이 차감하면 409 INSUFFICIENT_CREDIT 다", async () => {
    setup();
    const r = await deduct({ delta: -7 });
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("INSUFFICIENT_CREDIT");
    expect((r.body as { detail?: string }).detail).toBe(
      "잔여 6회보다 많이 차감할 수 없습니다.",
    );
  });

  test("DB 함수가 거절하면 상태 이름을 코드로 409 를 돌려준다", async () => {
    setup();
    deductStatus = "insufficient_credit";
    const r = await deduct();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("INSUFFICIENT_CREDIT");
    expect((r.body as { detail?: string }).detail).toBe(
      "잔여 횟수보다 많이 차감할 수 없습니다.",
    );
  });

  test("grant insert 오류는 500 이다", async () => {
    setup();
    insertError = { message: "boom" };
    expect((await post()).status).toBe(500);
  });

  test("차감은 회원 확인과 이용권 요약 읽기를 함께 시작한다", async () => {
    setup();
    const { admin, gate } = gateReads(
      kit.admin as ReturnType<typeof createAdminFake>,
      (target) =>
        (target.kind === "from" &&
          target.name === "profiles" &&
          target.nth === 1) ||
        (target.kind === "rpc" &&
          target.name === "fn_program_access_grants_summary" &&
          target.nth === 0),
    );
    kit.admin = admin;

    const request = deduct();
    await vi.waitFor(() => expect(gate.started.length).toBeGreaterThan(0));
    await gate.settle();
    expect([...gate.started].sort()).toEqual([
      "from:profiles",
      "rpc:fn_program_access_grants_summary",
    ]);
    gate.release();

    expect((await request).status).toBe(200);
  });

  test("없는 회원이면 이용권 요약 읽기 오류가 있어도 404 이다", async () => {
    setup();
    profiles = () => ({ data: null, error: null });
    const failing = kit.admin as ReturnType<typeof createAdminFake>;
    const rpc = failing.rpc;
    failing.rpc = (name, args) =>
      name === "fn_program_access_grants_summary"
        ? Promise.resolve({
            data: null,
            error: { message: "읽지 않아야 하는 결과" },
          })
        : rpc(name, args);

    const r = await deduct();

    expect(r.status).toBe(404);
  });
});
