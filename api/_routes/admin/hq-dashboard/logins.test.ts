// GET /api/admin/hq-dashboard/logins 계약 검증(분석 grill Q1, Q7, Q13).
// view=stats: 기간 묶음(일, 주, 달)별 서로 다른 회원 수와 출처, DAU 평균과 MAU 카드.
// view=log: 회원별 하루 1행 로그인 기록 표(쪽 나눔). 이름은 members 보기 권한이 있을 때만 보낸다.

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

import handler from "./logins.js";

type Args = Record<string, unknown>;
type Bucket = {
  bucket_start: string;
  bucket_end: string;
  source: string;
  members: number;
  by_member_type: Record<string, number>;
};

const get = (query: Record<string, string> = {}, zone = "Asia/Seoul") =>
  callHandler(
    (req, res) => {
      if (zone) req.headers["x-time-zone"] = zone;
      return handler(req, res);
    },
    undefined,
    "GET",
    query,
  );

let bucketCalls: Args[];
let logCalls: Args[];

function bucket(over: Partial<Bucket> = {}): Bucket {
  return {
    bucket_start: "2026-11-01",
    bucket_end: "2026-11-01",
    source: "measured",
    members: 2,
    by_member_type: { student: 2 },
    ...over,
  };
}

function setPermissions(rows: { resource_key: string; level: string }[]) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: rows,
    error: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // KST 2026-11-23 12:00
  vi.setSystemTime(new Date("2026-11-23T03:00:00Z"));
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  bucketCalls = [];
  logCalls = [];
  setPermissions([{ resource_key: "hqDashboard", level: "view" }]);
  kit.state.rpc.fn_hq_login_buckets = (args) => {
    bucketCalls.push(args);
    return {
      data: [
        bucket({
          bucket_start: String(args.p_from),
          bucket_end: String(args.p_to),
        }),
      ],
      error: null,
    };
  };
  kit.state.rpc.fn_hq_login_log = (args) => {
    logCalls.push(args);
    return { data: [], error: null };
  };
  kit.state.rows.profile_login_slots = () => ({
    slot_start: "2026-11-19T15:15:00+00:00",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/admin/hq-dashboard/logins 권한", () => {
  test.each([
    ["권한 없음", []],
    ["none", [{ resource_key: "hqDashboard", level: "none" }]],
    ["다른 메뉴만", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 통계를 읽지 않는다", async (_label, perms) => {
    setPermissions(perms);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_buckets");
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_log");
    expect(kit.state.reads).toHaveLength(0);
  });

  test("권한 조회가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get();

    expect(r.status).toBe(500);
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_buckets");
  });

  test("로그인하지 않으면 401 이다", async () => {
    kit.state.user = null;

    const r = await get();

    expect(r.status).toBe(401);
  });
});

describe("GET /api/admin/hq-dashboard/logins 입력 검사", () => {
  test.each([
    ["날짜 형식이 아님", { from: "2026/11/01" }],
    ["없는 날짜", { from: "2026-02-30" }],
    ["시작일이 종료일보다 늦음", { from: "2026-11-10", to: "2026-11-09" }],
    ["종료일이 오늘(KST)보다 뒤", { to: "2026-11-24" }],
    ["기간이 731일 초과", { from: "2024-11-21", to: "2026-11-22" }],
    ["모르는 묶음 단위", { grain: "year" }],
    ["모르는 MAU 기준", { mau: "weekly" }],
    ["모르는 화면", { view: "raw" }],
    ["모르는 범위", { scope: "b2b" }],
    ["쪽 번호가 0", { view: "log", page: "0" }],
    ["쪽 번호가 숫자가 아님", { view: "log", page: "x" }],
  ])("%s 이면 400 이고 통계를 읽지 않는다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "INVALID_QUERY" } });
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_buckets");
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_log");
  });

  test("기간이 딱 731일이면 받는다", async () => {
    const r = await get({ from: "2024-11-22", to: "2026-11-22" });

    expect(r.status).toBe(200);
  });
});

describe("GET /api/admin/hq-dashboard/logins view=stats", () => {
  test("기본값은 이번 달 1일부터 오늘(KST), 일 단위, 달력 기준 MAU, 내부 계정 제외", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.body).toMatchObject({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-23",
      grain: "day",
      mauMode: "calendar",
      includeInternal: false,
      firstMeasuredAt: "2026-11-19T15:15:00.000Z",
    });
    expect(bucketCalls[0]).toEqual({
      p_from: "2026-11-01",
      p_to: "2026-11-23",
      p_grain: "day",
      p_mau_mode: "calendar",
      p_include_internal: false,
      p_scope: "all",
      p_tz: "Asia/Seoul",
    });
    // 일 단위면 DAU 를 위해 다시 부르지 않고, MAU 는 종료일이 속한 달 1일부터 종료일까지 한 묶음.
    expect(bucketCalls).toHaveLength(2);
    expect(bucketCalls[1]).toEqual({
      p_from: "2026-11-01",
      p_to: "2026-11-23",
      p_grain: "month",
      p_mau_mode: "calendar",
      p_include_internal: false,
      p_scope: "all",
      p_tz: "Asia/Seoul",
    });
  });

  test("묶음을 그대로 옮겨 돌려준다", async () => {
    kit.state.rpc.fn_hq_login_buckets = (args) => ({
      data:
        args.p_grain === "day"
          ? [
              bucket({
                bucket_start: "2026-11-21",
                bucket_end: "2026-11-21",
                source: "estimated",
                members: 3,
                by_member_type: { student: 2, parent: 1 },
              }),
              bucket({
                bucket_start: "2026-11-22",
                bucket_end: "2026-11-22",
                source: "measured",
                members: 4,
                by_member_type: { student: 4 },
              }),
            ]
          : [
              bucket({
                bucket_start: "2026-11-01",
                bucket_end: "2026-11-22",
                members: 9,
              }),
            ],
      error: null,
    });

    const r = await get({ from: "2026-11-21", to: "2026-11-22" });

    expect(r.body).toMatchObject({
      series: [
        {
          start: "2026-11-21",
          end: "2026-11-21",
          source: "estimated",
          members: 3,
          byMemberType: { student: 2, parent: 1 },
        },
        {
          start: "2026-11-22",
          end: "2026-11-22",
          source: "measured",
          members: 4,
          byMemberType: { student: 4 },
        },
      ],
      dau: {
        from: "2026-11-21",
        to: "2026-11-22",
        average: 3.5,
        source: "estimated",
      },
      mau: {
        from: "2026-11-01",
        to: "2026-11-22",
        members: 9,
        source: "measured",
        mode: "calendar",
      },
    });
  });

  test("DAU 평균은 소수 첫째 자리로 반올림하고 모든 날이 실측일 때만 실측이다", async () => {
    kit.state.rpc.fn_hq_login_buckets = (args) => ({
      data:
        args.p_grain === "day"
          ? [
              bucket({ bucket_start: "2026-11-20", members: 1 }),
              bucket({ bucket_start: "2026-11-21", members: 1 }),
              bucket({ bucket_start: "2026-11-22", members: 2 }),
            ]
          : [bucket()],
      error: null,
    });

    const r = await get({ from: "2026-11-20", to: "2026-11-22" });

    expect(r.body).toMatchObject({ dau: { average: 1.3, source: "measured" } });
  });

  test("모든 날이 기록 없음이면 DAU 출처도 기록 없음", async () => {
    kit.state.rpc.fn_hq_login_buckets = () => ({
      data: [bucket({ source: "none", members: 0, by_member_type: {} })],
      error: null,
    });

    const r = await get({ from: "2026-11-01", to: "2026-11-01" });

    expect(r.body).toMatchObject({
      dau: { average: 0, source: "none" },
      mau: { members: 0, source: "none" },
    });
  });

  test("주 단위면 DAU 를 위해 일 단위로 한 번 더 부른다", async () => {
    await get({ from: "2026-11-02", to: "2026-11-15", grain: "week" });

    expect(bucketCalls.map((a) => a.p_grain)).toEqual(["week", "day", "month"]);
    expect(bucketCalls[1]).toMatchObject({
      p_from: "2026-11-02",
      p_to: "2026-11-15",
    });
  });

  test("최근 30일 기준이면 MAU 는 종료일 포함 30일이다", async () => {
    const r = await get({
      from: "2026-11-01",
      to: "2026-11-23",
      grain: "month",
      mau: "rolling30",
    });

    expect(bucketCalls[0]).toMatchObject({
      p_grain: "month",
      p_mau_mode: "rolling30",
    });
    const mauCall = bucketCalls[bucketCalls.length - 1];
    expect(mauCall).toEqual({
      p_from: "2026-10-25",
      p_to: "2026-11-23",
      p_grain: "month",
      p_mau_mode: "rolling30",
      p_include_internal: false,
      p_scope: "all",
      p_tz: "Asia/Seoul",
    });
    expect(r.body).toMatchObject({
      mauMode: "rolling30",
      mau: { from: "2026-10-25", to: "2026-11-23", mode: "rolling30" },
    });
  });

  test("includeInternal=1 이면 모든 집계가 QA, 관리자 계정을 포함한다", async () => {
    const r = await get({ includeInternal: "1", grain: "week" });

    expect(bucketCalls.every((a) => a.p_include_internal === true)).toBe(true);
    expect(r.body).toMatchObject({ includeInternal: true });
  });

  test("includeInternal=0 이면 기본 제외로 센다(기관 현황과 같은 키, 1 또는 0)", async () => {
    const r = await get({ includeInternal: "0" });

    expect(bucketCalls.every((a) => a.p_include_internal === false)).toBe(true);
    expect(r.body).toMatchObject({ includeInternal: false });
  });

  test("로그인 기록이 아직 없으면 firstMeasuredAt 은 null", async () => {
    kit.state.rows.profile_login_slots = () => null;

    const r = await get();

    expect(r.body).toMatchObject({ firstMeasuredAt: null });
  });

  test("첫 실측 시각은 slot_start 오름차순 한 줄로 읽는다", async () => {
    await get();

    const read = kit.state.reads.find((x) => x.table === "profile_login_slots");
    expect(read).toMatchObject({
      orderBy: { column: "slot_start", ascending: true },
      limit: 1,
    });
  });

  test("집계 함수가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_hq_login_buckets = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get();

    expect(r.status).toBe(500);
  });
});

describe("GET /api/admin/hq-dashboard/logins 시간대", () => {
  test.each(["stats", "log"])(
    "X-Time-Zone 헤더가 없으면 view=%s 는 400 TIME_ZONE_REQUIRED 이고 읽지 않는다",
    async (view) => {
      const r = await get({ view }, "");

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "TIME_ZONE_REQUIRED" } });
      expect(kit.state.events).not.toContain("rpc:fn_hq_login_buckets");
      expect(kit.state.events).not.toContain("rpc:fn_hq_login_log");
    },
  );

  test("보는 사람 시간대로 오늘을 정하고 모든 집계에 같은 시간대를 넘긴다", async () => {
    // 2026-11-23T03:00Z 는 로스앤젤레스에서 11-22 19:00 이다.
    const r = await get({ grain: "week" }, "America/Los_Angeles");

    expect(r.body).toMatchObject({ from: "2026-11-01", to: "2026-11-22" });
    expect(bucketCalls).toHaveLength(3);
    expect(bucketCalls.every((a) => a.p_tz === "America/Los_Angeles")).toBe(
      true,
    );
  });

  test("기록 표도 보는 사람 시간대를 넘긴다", async () => {
    await get({ view: "log" }, "UTC");

    expect(logCalls[0]).toMatchObject({ p_tz: "UTC" });
  });
});

describe("GET /api/admin/hq-dashboard/logins scope", () => {
  test("scope=b2c 면 모든 묶음 집계를 B2C 범위로 부르고 응답에 범위를 싣는다", async () => {
    const r = await get({ scope: "b2c", grain: "week" });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ scope: "b2c" });
    expect(bucketCalls).toHaveLength(3);
    expect(bucketCalls.every((a) => a.p_scope === "b2c")).toBe(true);
  });

  test("scope 가 없으면 전체(all)다", async () => {
    const r = await get();

    expect(r.body).toMatchObject({ scope: "all" });
    expect(bucketCalls.every((a) => a.p_scope === "all")).toBe(true);
  });
});

describe("GET /api/admin/hq-dashboard/logins view=log", () => {
  const row = {
    profile_id: "p-1",
    login_date: "2026-11-22",
    first_seen_at: "2026-11-22T00:10:00+00:00",
    name: "김학생",
    member_type: "student",
    tenant_name: "한빛고",
    total_count: 120,
  };

  test("쪽 크기 50, 2쪽이면 offset 50 으로 부르고 전체 건수를 돌려준다", async () => {
    kit.state.rpc.fn_hq_login_log = (args) => {
      logCalls.push(args);
      return { data: [row], error: null };
    };
    setPermissions([
      { resource_key: "hqDashboard", level: "view" },
      { resource_key: "members", level: "view" },
    ]);

    const r = await get({
      view: "log",
      from: "2026-11-01",
      to: "2026-11-22",
      page: "2",
    });

    expect(r.status).toBe(200);
    expect(logCalls[0]).toEqual({
      p_from: "2026-11-01",
      p_to: "2026-11-22",
      p_include_internal: false,
      p_limit: 50,
      p_offset: 50,
      p_tz: "Asia/Seoul",
    });
    expect(r.body).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-22",
      includeInternal: false,
      page: 2,
      pageSize: 50,
      total: 120,
      namesVisible: true,
      items: [
        {
          profileId: "p-1",
          loginDate: "2026-11-22",
          firstSeenAt: "2026-11-22T00:10:00.000Z",
          name: "김학생",
          memberType: "student",
          tenantName: "한빛고",
        },
      ],
    });
    expect(kit.state.events).not.toContain("rpc:fn_hq_login_buckets");
  });

  test("members 보기 권한이 없으면 이름을 보내지 않는다", async () => {
    kit.state.rpc.fn_hq_login_log = () => ({ data: [row], error: null });

    const r = await get({ view: "log" });

    const body = r.body as {
      namesVisible: boolean;
      items: { name: unknown }[];
    };
    expect(body.namesVisible).toBe(false);
    expect(body.items[0]?.name).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain("김학생");
  });

  test("기록이 없으면 전체 0", async () => {
    const r = await get({ view: "log" });

    expect(r.body).toMatchObject({ total: 0, items: [], page: 1 });
  });

  test("includeInternal=1 이면 기록 표도 포함한다", async () => {
    await get({ view: "log", includeInternal: "1" });

    expect(logCalls[0]).toMatchObject({ p_include_internal: true });
  });

  test("기록 조회가 실패하면 500 이다", async () => {
    kit.state.rpc.fn_hq_login_log = () => ({
      data: null,
      error: { message: "boom" },
    });

    const r = await get({ view: "log" });

    expect(r.status).toBe(500);
  });
});
