// GET /api/admin/hq-dashboard/b2c 계약 검증(분석 grill Q5 A11). 위닝 B2C 회원(기관 없음, 기타 소속) 수와
// 기간 결제 요약(admin_revenue_items 합). B2C DAU, MAU 는 logins?scope=b2c 가 준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./b2c.js";

type Args = Record<string, unknown>;

const get = (query: Record<string, string> = {}) =>
  callHandler(
    (req, res) => {
      req.headers["x-time-zone"] = "Asia/Seoul";
      return handler(req, res);
    },
    undefined,
    "GET",
    query,
  );

let calls: Args[];

function setPermissions(rows: { resource_key: string; level: string }[]) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: rows,
    error: null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/admin/hq-dashboard/b2c 시간대", () => {
  test("X-Time-Zone 헤더가 없으면 400 TIME_ZONE_REQUIRED 이고 통계를 읽지 않는다", async () => {
    setPermissions([{ resource_key: "hqDashboard", level: "view" }]);

    const r = await callHandler(handler, undefined, "GET");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "TIME_ZONE_REQUIRED" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_b2c_summary");
  });
});

describe("GET /api/admin/hq-dashboard/b2c 권한", () => {
  test.each([
    ["권한 없음", []],
    ["none", [{ resource_key: "hqDashboard", level: "none" }]],
    ["다른 메뉴만", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 통계를 읽지 않는다", async (_label, perms) => {
    setPermissions(perms);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_b2c_summary");
  });

  test("로그인하지 않으면 401 이다", async () => {
    kit.state.user = null;

    const r = await get();

    expect(r.status).toBe(401);
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // KST 2026-11-23 12:00
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  calls = [];
  setPermissions([{ resource_key: "hqDashboard", level: "view" }]);
  kit.state.rpc.fn_hq_b2c_summary = (args) => {
    calls.push(args);
    return {
      data: [
        {
          member_total: 120,
          by_member_type: { student: 80, parent: 40 },
          paying_members: 12,
          order_count: 15,
          paid_amount: 540000,
          refunded_amount: 18000,
          net_amount: 522000,
        },
      ],
      error: null,
    };
  };
});

describe("GET /api/admin/hq-dashboard/b2c 입력 검사", () => {
  test.each([
    ["날짜 형식이 아님", { from: "2026/11/01" }],
    ["없는 날짜", { to: "2026-02-30" }],
    ["시작일이 종료일보다 늦음", { from: "2026-11-10", to: "2026-11-09" }],
    ["종료일이 오늘(KST)보다 뒤", { to: "2026-11-24" }],
    ["기간이 731일 초과", { from: "2024-11-21", to: "2026-11-22" }],
  ])("%s 이면 400 이고 통계를 읽지 않는다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "INVALID_QUERY" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_b2c_summary");
  });
});

describe("GET /api/admin/hq-dashboard/b2c", () => {
  test("기본은 이번 달 1일부터 오늘(KST), 내부 계정 제외", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(calls).toEqual([
      { p_from: "2026-11-01", p_to: "2026-11-23", p_include_internal: false },
    ]);
  });

  test("회원 수와 결제 요약을 옮겨 돌려준다", async () => {
    const r = await get({ from: "2026-11-01", to: "2026-11-22" });

    expect(r.body).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-22",
      includeInternal: false,
      members: { total: 120, byMemberType: { student: 80, parent: 40 } },
      payments: {
        payingMembers: 12,
        orderCount: 15,
        paidAmount: 540000,
        refundedAmount: 18000,
        netAmount: 522000,
      },
    });
  });

  test("includeInternal=1 이면 포함으로 부른다", async () => {
    await get({ includeInternal: "1" });

    expect(calls[0]).toMatchObject({ p_include_internal: true });
  });

  test("요약 함수가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_hq_b2c_summary = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get();

    expect(r.status).toBe(500);
  });
});
