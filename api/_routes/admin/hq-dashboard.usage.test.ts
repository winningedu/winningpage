// GET /api/admin/hq-dashboard/usage 계약 검증(계획 6번 A5, 분석 grill Q6). 기관 x 5개 서비스 한 행에
// 이번 달, 이번 학기 쓴 횟수와 한도 다 쓴 학생 수. 수치는 fn_hq_tenant_usage 가 정본이다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { hqUsageSchema } from "../../../shared/hq-dashboard/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

// fn_hq_tenant_usage 는 1000행씩 이어 읽으므로 rpc 결과에 order, range 를 흉내 낸다.
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

const route = { app, path: "/api/admin/hq-dashboard/usage" };

const get = (query: Record<string, string> = {}) => callRoute(route, { query });

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "t-a",
    program_key: "diagnose",
    provided: true,
    month_limit: 2,
    term_limit: 3,
    month_used: 4,
    month_capped_students: 2,
    term_used: 5,
    term_capped_students: 1,
    term_resets_on: "2027-02-15",
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
  kit.state.rpc.fn_hq_tenant_usage = (args) => {
    rpcArgs.push(args);
    return { data: [usageRow()], error: null };
  };
});

describe("권한과 입력", () => {
  test("hqDashboard 보기 권한이 없으면 403", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "tenants", level: "edit" }],
      error: null,
    });
    const res = await get();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.events).not.toContain("rpc:fn_hq_tenant_usage");
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

  test("includeInternal 이 1, 0 이 아니면 400", async () => {
    const res = await get({ includeInternal: "yes" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(rpcArgs).toEqual([]);
  });

  test("조회가 실패하면 500", async () => {
    kit.state.rpc.fn_hq_tenant_usage = () => ({
      data: null,
      error: { message: "boom" },
    });
    const res = await get();
    expect(res.status).toBe(500);
  });
});

describe("사용량 행", () => {
  test("DB 행을 화면용 이름으로 준다", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).not.toHaveProperty("ok");
    expect(res.body).not.toHaveProperty("usage");
    expect(res.body).toMatchObject({
      items: [
        {
          tenantId: "t-a",
          programKey: "diagnose",
          provided: true,
          monthLimit: 2,
          termLimit: 3,
          monthUsed: 4,
          monthCappedStudents: 2,
          termUsed: 5,
          termCappedStudents: 1,
          termResetsOn: "2027-02-15",
        },
      ],
    });
    expect((res.body as { asOf: string }).asOf).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  test("1000행이 넘어도 모두 읽는다(기관 200곳 넘음)", async () => {
    const rows = Array.from({ length: 1250 }, (_, i) =>
      usageRow({ tenant_id: `t-${i}` }),
    );
    kit.state.rpc.fn_hq_tenant_usage = () => ({ data: rows, error: null });
    const res = await get();
    expect((res.body as { items: unknown[] }).items).toHaveLength(1250);
  });
});

describe("계약", () => {
  test("응답이 계약 스키마로 빠짐없이 읽힌다", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(hqUsageSchema.parse(res.body)).toEqual(res.body);
  });
});
