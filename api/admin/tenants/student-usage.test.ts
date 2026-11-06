// GET /api/admin/tenants/student-usage 계약 검증(사 #166, 결정 r5, r6). serviceCreditAdjust view 권한으로
// 학생의 6개 서비스 사용 상태(fn_tenant_usage_state)와 기관 설정, 학생별 조정 원값을 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./student-usage.js";

const STUDENT = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

function usageState(overrides: Record<string, unknown> = {}) {
  return {
    allowed: true,
    deny_reason: null,
    month_used: 1,
    month_limit: 3,
    month_remaining: 2,
    term_used: 4,
    term_limit: 24,
    term_remaining: 20,
    month_resets_on: "2026-12-01",
    term_resets_on: "2027-03-01",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SITE = "schoolmentor";
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [
      { resource_key: "serviceCreditAdjust", level: "view" },
      { resource_key: "tenants", level: "view" },
    ],
    error: null,
  });
  kit.state.rpc.fn_tenant_usage_state = () => ({
    data: [usageState()],
    error: null,
  });
  kit.state.rows.profiles = (filters) =>
    matchRows([{ id: STUDENT, tenant_id: TENANT }], filters)[0] ?? null;
  kit.state.rows.tenants = (filters) =>
    matchRows(
      [{ id: TENANT, name: "한빛고", is_catch_all: false }],
      filters,
    )[0] ?? null;
  kit.state.rows.tenant_service_settings = (filters) =>
    matchRows(
      [
        {
          tenant_id: TENANT,
          program_key: "diagnose",
          enabled: true,
          monthly_limit: 3,
          term_limit: null,
        },
      ],
      filters,
    );
  kit.state.rows.student_usage_overrides = (filters) =>
    matchRows(
      [
        {
          profile_id: STUDENT,
          program_key: "diagnose",
          monthly_limit: 5,
          term_limit: null,
        },
      ],
      filters,
    );
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/student-usage", () => {
  test.each([
    ["권한 없음", []],
    ["none", [{ resource_key: "serviceCreditAdjust", level: "none" }]],
    ["tenants view 만", [{ resource_key: "tenants", level: "view" }]],
    [
      "serviceCreditAdjust view 만(기관 설정은 tenants view 가 필요하다)",
      [{ resource_key: "serviceCreditAdjust", level: "view" }],
    ],
    [
      "tenants 가 none",
      [
        { resource_key: "serviceCreditAdjust", level: "edit" },
        { resource_key: "tenants", level: "none" },
      ],
    ],
  ])("%s 이면 403 이고 아무것도 읽지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
    expect(kit.state.reads).toHaveLength(0);
  });

  test("권한 조회가 아무것도 돌려주지 않으면 403 이고 아무것도 읽지 않는다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: null,
    });

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.reads).toHaveLength(0);
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
  });

  test("스쿨멘토가 아닌 사이트에서는 404 이고 아무것도 읽지 않는다", async () => {
    delete process.env.SITE;

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(404);
    expect(kit.state.reads).toHaveLength(0);
  });

  test("profileId 가 UUID 가 아니면 400", async () => {
    const r = await get({ profileId: "student-1" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
  });

  test("학생이 없으면 404", async () => {
    kit.state.rows.profiles = () => null;

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  test("6개 서비스를 사 #5 순서로 사용 상태와 원값으로 돌려준다", async () => {
    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as {
      tenant: unknown;
      programs: Record<string, unknown>[];
    };
    expect(body.tenant).toEqual({
      id: TENANT,
      name: "한빛고",
      isCatchAll: false,
    });
    expect(body.programs.map((p) => p.programKey)).toEqual([
      "diagnose",
      "target",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ]);
    expect(body.programs[0]).toMatchObject({
      allowed: true,
      denyReason: null,
      monthUsed: 1,
      monthLimit: 3,
      monthRemaining: 2,
      termUsed: 4,
      termLimit: 24,
      termRemaining: 20,
      monthResetsOn: "2026-12-01",
      termResetsOn: "2027-03-01",
      setting: { enabled: true, monthlyLimit: 3, termLimit: null },
      override: { monthlyLimit: 5, termLimit: null },
    });
    expect(body.programs[1]).toMatchObject({
      programKey: "target",
      setting: null,
      override: null,
    });
  });

  test("기타 기관 학생은 막힘 사유 catch_all 을 그대로 보인다", async () => {
    kit.state.rows.tenants = () => ({
      id: TENANT,
      name: "기타",
      is_catch_all: true,
    });
    kit.state.rpc.fn_tenant_usage_state = () => ({
      data: [usageState({ allowed: false, deny_reason: "catch_all" })],
      error: null,
    });

    const r = await get({ profileId: STUDENT });

    const body = r.body as {
      tenant: { isCatchAll: boolean };
      programs: { allowed: boolean; denyReason: string }[];
    };
    expect(body.tenant.isCatchAll).toBe(true);
    expect(body.programs.every((p) => p.denyReason === "catch_all")).toBe(true);
  });

  test("기관이 없는 학생은 tenant null 로 돌려주고 설정 원값은 비운다", async () => {
    kit.state.rows.profiles = () => ({ id: STUDENT, tenant_id: null });
    kit.state.rpc.fn_tenant_usage_state = () => ({
      data: [usageState({ allowed: false, deny_reason: "disabled" })],
      error: null,
    });

    const r = await get({ profileId: STUDENT });

    const body = r.body as {
      tenant: unknown;
      programs: { setting: unknown }[];
    };
    expect(body.tenant).toBeNull();
    expect(body.programs.every((p) => p.setting === null)).toBe(true);
    expect(kit.state.reads.map((x) => x.table)).not.toContain("tenants");
  });

  test("사용 상태 조회가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_tenant_usage_state = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(500);
  });
});
