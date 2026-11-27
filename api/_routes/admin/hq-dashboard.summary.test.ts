// GET /api/admin/hq-dashboard/summary 계약 검증(계획 4번 A1, A2). 전체 기관, 학생, 선생님 수와 계약 상태별 기관 수.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hqSummarySchema } from "../../../shared/hq-dashboard/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

// fn_hq_tenant_students 는 1000행씩 이어 읽으므로 rpc 결과에 order, range 를 흉내 낸다.
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const admin = createFakeAdmin(kit.state);
    const rpc = admin.rpc;
    admin.rpc = ((name: string, args: Record<string, unknown>) => {
      const pending = rpc(name, args);
      const chain = {
        order: () => chain,
        range: (from: number, to: number) =>
          pending.then((r: { data: unknown; error: unknown }) => ({
            ...r,
            data: Array.isArray(r.data) ? r.data.slice(from, to + 1) : r.data,
          })),
        // biome-ignore lint/suspicious/noThenProperty: Supabase rpc 빌더처럼 await 할 수 있어야 한다.
        then: (
          resolve: (r: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => pending.then(resolve, reject),
      };
      return chain;
    }) as unknown as typeof admin.rpc;
    return admin;
  },
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/hq-dashboard/summary" };

const get = (query: Record<string, string> = {}) => callRoute(route, { query });

function overviewRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "t-a",
    name: "한빛고",
    region: "서울",
    org_type: "학교",
    contract_start_date: "2026-03-01",
    contract_end_date: "2027-02-28",
    grace_end: "2027-03-30",
    trial_start_date: null,
    trial_end_date: null,
    contract_status: "active",
    student_count: 10,
    student_without_enrollment_count: 2,
    teacher_count: 3,
    last_activity_on: "2026-11-22",
    ...overrides,
  };
}

let rpcArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  rpcArgs = [];
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "hqDashboard", level: "view" }],
    error: null,
  });
  kit.state.rpc.fn_hq_tenant_overview = (args) => {
    rpcArgs.push(args);
    return { data: [overviewRow()], error: null };
  };
  kit.state.rpc.fn_hq_tenant_students = () => ({ data: [], error: null });
  kit.state.rows.goal_students = () => [];
  kit.state.rows.goal_daily_records = () => [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("권한과 입력", () => {
  test("hqDashboard 보기 권한이 없으면 403 FORBIDDEN problem", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "tenants", level: "edit" }],
      error: null,
    });
    const res = await get();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.events).not.toContain("rpc:fn_hq_tenant_overview");
  });

  test("hqDashboard 편집 권한이어도 읽을 수 있다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "hqDashboard", level: "edit" }],
      error: null,
    });
    const res = await get();
    expect(res.status).toBe(200);
  });

  test("GET 이 아니면 405 problem", async () => {
    const res = await callRoute(route, { method: "POST", body: {} });
    expect(res.status).toBe(405);
    expect(res.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(res.headers.allow).toBe("GET, HEAD");
  });

  test("기본은 QA, 관리자 계정을 뺀다(p_include_internal false)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(rpcArgs).toEqual([{ p_include_internal: false }]);
  });

  test("includeInternal=1 이면 포함해서 센다", async () => {
    await get({ includeInternal: "1" });
    expect(rpcArgs).toEqual([{ p_include_internal: true }]);
  });

  test("includeInternal 이 1, 0 이 아니면 400 VALIDATION_FAILED", async () => {
    const res = await get({ includeInternal: "yes" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.state.events).not.toContain("rpc:fn_hq_tenant_overview");
  });

  test("includeInternal=0 은 제외로 센다", async () => {
    await get({ includeInternal: "0" });
    expect(rpcArgs).toEqual([{ p_include_internal: false }]);
  });

  test("기관 현황 조회가 실패하면 500", async () => {
    kit.state.rpc.fn_hq_tenant_overview = () => ({
      data: null,
      error: { message: "boom" },
    });
    const res = await get();
    expect(res.status).toBe(500);
  });
});

describe("기준 시각", () => {
  test("asOf 는 ISO Z 순간이다(날짜 문자열이 아니다)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T16:00:00.000Z"));

    const res = await get();

    expect((res.body as { asOf: string }).asOf).toBe(
      "2026-11-30T16:00:00.000Z",
    );
  });
});

describe("합계 카드", () => {
  test("기관 행을 더해 기관 수, 학생 수, 선생님 수, 계약 상태별 수(시범기간 중 포함)를 준다", async () => {
    kit.state.rpc.fn_hq_tenant_overview = () => ({
      data: [
        overviewRow({ tenant_id: "t-1", contract_status: "active" }),
        overviewRow({
          tenant_id: "t-2",
          contract_status: "ending_soon",
          student_count: 5,
          student_without_enrollment_count: 0,
          teacher_count: 1,
        }),
        overviewRow({
          tenant_id: "t-3",
          contract_status: "expired",
          student_count: 0,
          student_without_enrollment_count: 0,
          teacher_count: 0,
        }),
        overviewRow({
          tenant_id: "t-4",
          contract_status: "grace",
          student_count: 1,
          student_without_enrollment_count: 1,
          teacher_count: 0,
        }),
        overviewRow({
          tenant_id: "t-5",
          contract_status: "none",
          student_count: 0,
          student_without_enrollment_count: 0,
          teacher_count: 0,
        }),
        overviewRow({
          tenant_id: "t-6",
          contract_status: "trial",
          student_count: 2,
          student_without_enrollment_count: 0,
          teacher_count: 1,
        }),
      ],
      error: null,
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).not.toHaveProperty("ok");
    expect(res.body).toMatchObject({
      tenantCount: 6,
      studentCount: 18,
      studentWithoutEnrollmentCount: 3,
      teacherCount: 5,
      contracts: {
        trial: 1,
        none: 1,
        upcoming: 0,
        active: 1,
        endingSoon: 1,
        grace: 1,
        expired: 1,
      },
    });
  });

  test("기관이 없으면 모두 0", async () => {
    kit.state.rpc.fn_hq_tenant_overview = () => ({ data: [], error: null });
    const res = await get();
    expect(res.body).toMatchObject({
      tenantCount: 0,
      studentCount: 0,
      teacherCount: 0,
      contracts: { trial: 0, active: 0, endingSoon: 0, grace: 0, expired: 0 },
    });
  });

  test("합계 카드는 목표 실행률을 읽지 않는다", async () => {
    await get();
    expect(kit.state.events).not.toContain("rpc:fn_hq_tenant_students");
  });
});

describe("계약", () => {
  test("응답이 계약 스키마로 빠짐없이 읽힌다", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(hqSummarySchema.parse(res.body)).toEqual(res.body);
  });
});
