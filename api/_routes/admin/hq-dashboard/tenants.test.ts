// GET /api/admin/hq-dashboard/tenants 계약 검증(계획 4번 A3, A4, A6). 기관 한 행에 계약, 학생, 선생님, 마지막 활동일,
// 목표 실행률 평균(goalRate.ts 계산, 달성율이 없는 학생은 뺌, 결정 62).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

// fn_hq_tenant_students 는 1000행씩 이어 읽으므로 rpc 결과에 order, range 를 흉내 낸다.
vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
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

import handler from "./tenants.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

function overviewRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "t-a",
    name: "한빛고",
    region: "서울",
    org_type: "학교",
    contract_start_date: "2026-03-01",
    contract_end_date: "2027-02-28",
    grace_end: "2027-03-30",
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
  test("hqDashboard 보기 권한이 없으면 403", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "tenants", level: "edit" }],
      error: null,
    });
    const res = await get();
    expect(res.status).toBe(403);
    expect(kit.state.events).not.toContain("rpc:fn_hq_tenant_overview");
  });

  test("GET 이 아니면 405", async () => {
    const res = await callHandler(handler, {}, "POST");
    expect(res.status).toBe(405);
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

// 2026-11-23(월) 12:00 KST. 이번 주 = 11-16(월) ~ 11-22(일).
const NOW = new Date("2026-11-23T03:00:00Z");
const WEEK = [
  "2026-11-16",
  "2026-11-17",
  "2026-11-18",
  "2026-11-19",
  "2026-11-20",
  "2026-11-21",
];
const SCHEDULE = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map(
    (d) => [d, { ideal: 2, min: 1 }],
  ),
);

function goalStudent(
  profileId: string,
  schedule: Record<string, unknown> = SCHEDULE,
) {
  return {
    profile_id: profileId,
    study_schedule: schedule,
    ideal_university: "",
    ideal_department: "",
    min_university: "",
    min_department: "",
  };
}

function records(profileId: string, hours: number) {
  return WEEK.map((record_date) => ({
    profile_id: profileId,
    record_date,
    study_hours: hours,
    target_ideal_hours: 2,
    target_min_hours: 1,
  }));
}

function useGoalFixture(
  students: {
    tenant_id: string;
    profile_id: string;
    has_enrollment: boolean;
  }[],
  goalRows: ReturnType<typeof goalStudent>[],
  recordRows: ReturnType<typeof records>,
) {
  kit.state.rpc.fn_hq_tenant_students = () => ({ data: students, error: null });
  kit.state.rows.goal_students = (f) => matchRows(goalRows, f);
  kit.state.rows.goal_daily_records = (f) => matchRows(recordRows, f);
}

describe("기관 목록", () => {
  test("기관 행을 화면용 이름으로 준다", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body).toMatchObject({
      ok: true,
      tenants: [
        {
          tenantId: "t-a",
          name: "한빛고",
          region: "서울",
          orgType: "학교",
          contractStartDate: "2026-03-01",
          contractEndDate: "2027-02-28",
          graceEnd: "2027-03-30",
          contractStatus: "active",
          studentCount: 10,
          studentWithoutEnrollmentCount: 2,
          teacherCount: 3,
          lastActivityOn: "2026-11-22",
          goalRateAverage: null,
          goalUserCount: 0,
        },
      ],
    });
  });

  test("목표 실행률 평균: 기관별로 목표관리 학생의 주간 달성율 평균을 반올림한다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    kit.state.rpc.fn_hq_tenant_overview = () => ({
      data: [
        overviewRow({ tenant_id: "t-a" }),
        overviewRow({ tenant_id: "t-b", name: "두리중" }),
      ],
      error: null,
    });
    useGoalFixture(
      [
        { tenant_id: "t-a", profile_id: "s-100", has_enrollment: true },
        { tenant_id: "t-a", profile_id: "s-50", has_enrollment: false },
        { tenant_id: "t-a", profile_id: "s-25", has_enrollment: true },
        { tenant_id: "t-a", profile_id: "s-nogoal", has_enrollment: true },
        { tenant_id: "t-b", profile_id: "s-noset", has_enrollment: true },
      ],
      [
        goalStudent("s-100"),
        goalStudent("s-50"),
        goalStudent("s-25"),
        goalStudent("s-noset", {}),
      ],
      [...records("s-100", 2), ...records("s-50", 1), ...records("s-25", 0.5)],
    );
    const res = await get();
    const tenants = (res.body as { tenants: Record<string, unknown>[] })
      .tenants;
    // (100 + 50 + 25) / 3 = 58.33
    expect(tenants[0]).toMatchObject({
      tenantId: "t-a",
      goalRateAverage: 58,
      goalUserCount: 3,
    });
    // 목표 설정일이 없어 달성율이 null 인 학생은 평균에서 빠진다.
    expect(tenants[1]).toMatchObject({
      tenantId: "t-b",
      goalRateAverage: null,
      goalUserCount: 1,
    });
  });

  test("목표관리 학생이 100명을 넘어도 모두 센다(나눠 읽기)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const ids = Array.from({ length: 250 }, (_, i) => `s-${i}`);
    useGoalFixture(
      ids.map((profile_id) => ({
        tenant_id: "t-a",
        profile_id,
        has_enrollment: true,
      })),
      ids.map((id) => goalStudent(id)),
      ids.flatMap((id) => records(id, 2)),
    );
    const res = await get();
    expect(
      (res.body as { tenants: Record<string, unknown>[] }).tenants[0],
    ).toMatchObject({
      goalRateAverage: 100,
      goalUserCount: 250,
    });
  });

  test("학생 목록도 같은 포함 스위치로 읽는다", async () => {
    const studentArgs: Record<string, unknown>[] = [];
    kit.state.rpc.fn_hq_tenant_students = (args) => {
      studentArgs.push(args);
      return { data: [], error: null };
    };
    await get({ includeInternal: "1" });
    expect(studentArgs).toEqual([{ p_include_internal: true }]);
  });

  test("학생 목록 조회가 실패하면 500", async () => {
    kit.state.rpc.fn_hq_tenant_students = () => ({
      data: null,
      error: { message: "boom" },
    });
    const res = await get();
    expect(res.status).toBe(500);
  });
});
