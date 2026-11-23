// GET /api/admin/hq-dashboard/trends 계약 검증(분석 grill Q5 A10). 로그인 지표와 같은 기간, 묶음, MAU 기준마다
// 새 가입 회원 수(유형별)와 결제 주문 수.

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

import handler from "./trends.js";

type Args = Record<string, unknown>;

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

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

describe("GET /api/admin/hq-dashboard/trends 권한", () => {
  test.each([
    ["권한 없음", []],
    ["none", [{ resource_key: "hqDashboard", level: "none" }]],
    ["다른 메뉴만", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 통계를 읽지 않는다", async (_label, perms) => {
    setPermissions(perms);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_trend_buckets");
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
  kit.state.rpc.fn_hq_trend_buckets = (args) => {
    calls.push(args);
    return {
      data: [
        {
          bucket_start: "2026-11-22",
          bucket_end: "2026-11-22",
          signups: 3,
          signups_by_member_type: { student: 2, parent: 1 },
          paid_orders: 2,
        },
        {
          bucket_start: "2026-11-23",
          bucket_end: "2026-11-23",
          signups: 0,
          signups_by_member_type: {},
          paid_orders: 0,
        },
      ],
      error: null,
    };
  };
});

describe("GET /api/admin/hq-dashboard/trends 입력 검사", () => {
  test.each([
    ["날짜 형식이 아님", { from: "2026/11/01" }],
    ["없는 날짜", { from: "2026-02-30" }],
    ["시작일이 종료일보다 늦음", { from: "2026-11-10", to: "2026-11-09" }],
    ["종료일이 오늘(KST)보다 뒤", { to: "2026-11-24" }],
    ["기간이 731일 초과", { from: "2024-11-21", to: "2026-11-22" }],
    ["모르는 묶음 단위", { grain: "year" }],
    ["모르는 MAU 기준", { mau: "weekly" }],
  ])("%s 이면 400 이고 통계를 읽지 않는다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "INVALID_QUERY" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_trend_buckets");
  });
});

describe("GET /api/admin/hq-dashboard/trends", () => {
  test("기본값은 이번 달 1일부터 오늘(KST), 일 단위, 달력 기준, 내부 계정 제외", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(calls).toEqual([
      {
        p_from: "2026-11-01",
        p_to: "2026-11-23",
        p_grain: "day",
        p_mau_mode: "calendar",
        p_include_internal: false,
      },
    ]);
    expect(r.body).toMatchObject({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-23",
      grain: "day",
      mauMode: "calendar",
      includeInternal: false,
    });
  });

  test("묶음마다 가입 수, 유형별 가입 수, 결제 주문 수를 옮겨 돌려준다", async () => {
    const r = await get();

    expect((r.body as { series: unknown }).series).toEqual([
      {
        start: "2026-11-22",
        end: "2026-11-22",
        signups: 3,
        signupsByMemberType: { student: 2, parent: 1 },
        paidOrders: 2,
      },
      {
        start: "2026-11-23",
        end: "2026-11-23",
        signups: 0,
        signupsByMemberType: {},
        paidOrders: 0,
      },
    ]);
  });

  test("쿼리의 기간, 묶음, MAU 기준, includeInternal=1 을 그대로 넘긴다", async () => {
    await get({
      from: "2026-10-01",
      to: "2026-11-22",
      grain: "month",
      mau: "rolling30",
      includeInternal: "1",
    });

    expect(calls[0]).toEqual({
      p_from: "2026-10-01",
      p_to: "2026-11-22",
      p_grain: "month",
      p_mau_mode: "rolling30",
      p_include_internal: true,
    });
  });

  test("집계 함수가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_hq_trend_buckets = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get();

    expect(r.status).toBe(500);
  });
});
