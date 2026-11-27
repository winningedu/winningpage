// /api/admin/tenants/student-usage 계약 검증(사 #166, 결정 r5, r6). GET 은 serviceCreditAdjust view 와 tenants view 권한으로
// 학생의 6개 서비스 사용 상태(fn_tenant_usage_state)와 기관 설정, 학생별 조정 원값을 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  // 관리자 본인 토큰으로 만든 클라이언트(auth.uid() 가 관리자). 쓰기는 여기로만 나가야 한다.
  userState: null as unknown as KitState,
  userClientTokens: [] as string[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.userClientTokens.push(token);
    return createFakeAdmin(kit.userState);
  },
}));

import { callHandler } from "../../_lib/tenantRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/tenants/student-usage" };

const STUDENT = "5b1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

// 관리자 판정(role)과 학생 조회가 profiles 읽기를 나눠 쓴다. 학생 행만 바꿀 때 쓴다.
const withStudent =
  (student: Record<string, unknown> | null) =>
  (filters: Record<string, unknown>) =>
    filters.id === "hq-1" ? { role: "admin" } : student;

// 관리자 판정이 profiles 를 한 번 읽으므로 그 밖의 읽기만 센다.
const dataReads = () =>
  kit.state.reads.map((x) => x.table).filter((table) => table !== "profiles");

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
  kit.userState = createKitState();
  kit.userClientTokens.length = 0;
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
  // 같은 profiles 읽기를 관리자 판정(role)과 학생 조회가 나눠 쓴다.
  kit.state.rows.profiles = (filters) =>
    filters.id === "hq-1"
      ? { role: "admin" }
      : (matchRows([{ id: STUDENT, tenant_id: TENANT }], filters)[0] ?? null);
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
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
    expect(dataReads()).toHaveLength(0);
  });

  test("권한 조회가 아무것도 돌려주지 않으면 403 이고 아무것도 읽지 않는다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: null,
    });

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(dataReads()).toHaveLength(0);
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
  });

  test("스쿨멘토가 아닌 사이트에서는 404 이고 아무것도 읽지 않는다", async () => {
    delete process.env.SITE;

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(dataReads()).toHaveLength(0);
  });

  test("profileId 가 UUID 가 아니면 400", async () => {
    const r = await get({ profileId: "student-1" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.state.events).not.toContain("rpc:fn_tenant_usage_state");
  });

  test("학생이 없으면 404", async () => {
    kit.state.rows.profiles = withStudent(null);

    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("6개 서비스를 사 #5 순서로 사용 상태와 원값으로 돌려준다", async () => {
    const r = await get({ profileId: STUDENT });

    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const body = r.body as {
      tenant: unknown;
      programs: Record<string, unknown>[];
    };
    expect(body).not.toHaveProperty("ok");
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
    kit.state.rows.profiles = withStudent({ id: STUDENT, tenant_id: null });
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

describe("PUT /api/admin/tenants/student-usage", () => {
  const PROFILE_B = "6c2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";
  const put = (body: unknown) => callHandler(handler, body, "PUT");

  const ROWS = [
    { profile_id: STUDENT, program_key: "diagnose", monthly_limit: 5 },
    { profile_id: PROFILE_B, program_key: "diagnose", monthly_limit: 5 },
    {
      profile_id: STUDENT,
      program_key: "target",
      monthly_limit: null,
      term_limit: 2,
    },
  ];

  beforeEach(() => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "serviceCreditAdjust", level: "edit" }],
      error: null,
    });
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "serviceCreditAdjust", level: "view" }],
      error: null,
    });

    const r = await put({ rows: ROWS });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(kit.userClientTokens).toHaveLength(0);
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 열 묶음마다 upsert 하고 updated_by 를 서버가 채운다", async () => {
    const r = await put({ rows: ROWS });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ saved: 3 });
    // 변경 이력 트리거가 auth.uid() 를 변경자로 남기므로 service_role 로 쓰지 않는다.
    expect(kit.userClientTokens).toEqual(["token"]);
    expect(kit.state.upserts).toHaveLength(0);
    expect(kit.userState.upserts).toEqual([
      {
        table: "student_usage_overrides",
        row: [
          { ...ROWS[0], updated_by: "hq-1" },
          { ...ROWS[1], updated_by: "hq-1" },
        ],
        onConflict: "profile_id,program_key",
      },
      {
        table: "student_usage_overrides",
        row: [{ ...ROWS[2], updated_by: "hq-1" }],
        onConflict: "profile_id,program_key",
      },
    ]);
  });

  test("안 보낸 한도 칸은 upsert 행에 키째 없다(기존 조정을 덮지 않는다)", async () => {
    const r = await put({
      rows: [
        { profile_id: STUDENT, program_key: "diagnose", monthly_limit: 2 },
        { profile_id: STUDENT, program_key: "growth", term_limit: null },
      ],
    });

    expect(r.status).toBe(200);
    const sent = kit.userState.upserts.map((u) => u.row) as unknown as Record<
      string,
      unknown
    >[][];
    expect(sent).toHaveLength(2);
    expect(sent[0]?.[0]).not.toHaveProperty("term_limit");
    expect(sent[1]?.[0]).not.toHaveProperty("monthly_limit");
    expect(sent[1]?.[0]).toHaveProperty("term_limit", null);
  });

  test("클라이언트가 보낸 updated_by 는 무시한다", async () => {
    await put({ rows: [{ ...ROWS[0], updated_by: "someone-else" }] });

    const sent = kit.userState.upserts[0]?.row as unknown as
      | { updated_by: string }[]
      | undefined;
    expect(sent?.[0]?.updated_by).toBe("hq-1");
  });

  test("진짜 칼럼이지만 클라이언트가 못 쓰는 updated_by, updated_at 은 버리고 서버가 채운다", async () => {
    const r = await put({
      rows: [
        {
          ...ROWS[0],
          updated_by: "someone-else",
          updated_at: "2020-01-01T00:00:00Z",
        },
      ],
    });

    expect(r.status).toBe(200);
    expect(kit.userState.upserts[0]?.row).toEqual([
      { ...ROWS[0], updated_by: "hq-1" },
    ]);
  });

  test.each([
    ["테이블에 없는 created_at", { created_at: "2026-11-01T00:00:00Z" }],
    ["테이블에 없는 id", { id: "x" }],
    ["모르는 키", { enabled: true }],
  ])("행에 %s 가 있으면 400 이고 쓰지 않는다", async (_label, extra) => {
    const r = await put({ rows: [{ ...ROWS[0], ...extra }] });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.userClientTokens).toHaveLength(0);
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("없는 학생(외래키 위반 23503)이면 404 NOT_FOUND 이다", async () => {
    kit.userState.insertErrors.student_usage_overrides = { code: "23503" };

    const r = await put({ rows: ROWS });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(kit.userState.upserts).toHaveLength(1);
  });

  test("service_role 클라이언트로는 아무것도 쓰지 않는다", async () => {
    await put({ rows: ROWS });

    expect(kit.state.upserts).toHaveLength(0);
    expect(
      kit.state.events.filter((e) => /insert|update|upsert|delete/.test(e)),
    ).toEqual([]);
  });

  test("첫 오류에서 멈추고 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.userState.insertErrors.student_usage_overrides = { code: "42501" };

    const r = await put({ rows: ROWS });

    expect(r.status).toBe(500);
    expect(kit.userState.upserts).toHaveLength(1);
  });

  test.each([
    ["본문 없음", undefined],
    ["빈 rows", { rows: [] }],
    ["rows 가 배열이 아님", { rows: ROWS[0] }],
    ["uuid 가 아닌 profile_id", { rows: [{ ...ROWS[0], profile_id: "s-1" }] }],
    ["모르는 program_key", { rows: [{ ...ROWS[0], program_key: "x" }] }],
    ["0 한도", { rows: [{ ...ROWS[0], monthly_limit: 0 }] }],
    ["32768 한도", { rows: [{ ...ROWS[0], term_limit: 32768 }] }],
    ["소수 한도", { rows: [{ ...ROWS[0], monthly_limit: 1.5 }] }],
    ["문자열 한도", { rows: [{ ...ROWS[0], monthly_limit: "3" }] }],
    [
      "한도 칸이 둘 다 없음",
      { rows: [{ profile_id: STUDENT, program_key: "diagnose" }] },
    ],
  ])("%s 이면 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await put(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("스쿨멘토가 아닌 사이트에서는 404 이고 쓰지 않는다", async () => {
    delete process.env.SITE;

    const r = await put({ rows: ROWS });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("QA 계정은 쓰지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await put({ rows: ROWS });

    expect(r.status).toBe(403);
    expect(kit.userState.upserts).toHaveLength(0);
  });
});
