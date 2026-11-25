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

describe("GET /api/admin/hq-dashboard/trends 권한", () => {
  test.each([
    ["권한 없음", []],
    ["none", [{ resource_key: "hqDashboard", level: "none" }]],
    ["다른 메뉴만", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 통계를 읽지 않는다", async (_label, perms) => {
    setPermissions(perms);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.events).not.toContain("rpc:fn_hq_trend_buckets");
  });

  test("편집 권한이어도 읽을 수 있다", async () => {
    setPermissions([{ resource_key: "hqDashboard", level: "edit" }]);

    const r = await get();

    expect(r.status).toBe(200);
  });

  test("로그인하지 않으면 401 이다", async () => {
    kit.state.user = null;

    const r = await get();

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("GET 이 아니면 405 problem", async () => {
    const r = await callHandler(handler, {}, "POST");

    expect(r.status).toBe(405);
    expect(r.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // KST 2026-11-23 12:00
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
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
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
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
        p_tz: "Asia/Seoul",
      },
    ]);
    expect(r.body).not.toHaveProperty("ok");
    expect(r.body).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-23",
      grain: "day",
      mauMode: "calendar",
      includeInternal: false,
    });
  });

  test("includeInternal 은 1 일 때만 포함이고 다른 값은 제외다", async () => {
    await get({ includeInternal: "yes" });

    expect(calls[0]).toMatchObject({ p_include_internal: false });
  });

  test("기간 오류는 화면에 보일 문구와 함께 400 VALIDATION_FAILED 이다", async () => {
    const r = await get({ from: "2026-11-10", to: "2026-11-09" });

    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "시작일이 종료일보다 늦습니다.",
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
      p_tz: "Asia/Seoul",
    });
  });

  test("보는 사람 시간대(X-Time-Zone)를 p_tz 로 넘긴다", async () => {
    await callHandler(
      (req, res) => {
        req.headers["x-time-zone"] = "America/Los_Angeles";
        return handler(req, res);
      },
      undefined,
      "GET",
    );

    expect(calls[0]).toMatchObject({ p_tz: "America/Los_Angeles" });
  });

  test("X-Time-Zone 헤더가 없으면 400 TIME_ZONE_REQUIRED 이고 통계를 읽지 않는다", async () => {
    const r = await callHandler(handler, undefined, "GET");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "TIME_ZONE_REQUIRED" });
    expect(kit.state.events).not.toContain("rpc:fn_hq_trend_buckets");
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
