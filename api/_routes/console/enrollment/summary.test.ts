// GET /api/console/enrollment/summary 계약 검증(W7 이용현황). 학교 관리자 전용, 반별 총원과 서비스별 이용 인원.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./summary.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const enrollment = (
  student: string,
  classId: string | null,
  over: Record<string, unknown> = {},
) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  student_id: student,
  grade: "고1",
  class_id: classId,
  number: 1,
  ...over,
});

const CLASSES = [
  {
    id: "c-2",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고1",
    group_id: null,
    name: "2",
    capacity: null,
  },
  {
    id: "c-1",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고1",
    group_id: null,
    name: "1",
    capacity: 4,
  },
  {
    id: "c-x",
    tenant_id: "tenant-2",
    school_year: 2026,
    grade: "고1",
    group_id: null,
    name: "1",
    capacity: 9,
  },
];

const ENROLLMENTS = [
  enrollment("s1", "c-1"),
  enrollment("s2", "c-1"),
  enrollment("s3", "c-1"),
  enrollment("s4", "c-2"),
  enrollment("s5", "c-2", { status: "graduated" }),
  enrollment("sx", "c-x", { tenant_id: "tenant-2" }),
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
  kit.state.rows.class_groups = () => [];
  kit.state.rows.teacher_class_assignments = (f) =>
    matchRows(
      [{ tenant_id: "tenant-1", class_id: "c-1", teacher_id: "t1" }],
      f,
    );
  kit.state.rows.teachers = (f) =>
    matchRows([{ id: "t1", tenant_id: "tenant-1", name: "김담임" }], f);
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
  for (const table of [
    "growth_profiles",
    "growth_reports",
    "performance_sessions",
    "selfeval_sessions",
    "inquiry_sessions",
  ])
    kit.state.rows[table] = () => [];
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows(
      [
        { id: "a1", profile_id: "s1" },
        { id: "a2", profile_id: "s4" },
      ],
      f,
    );
  kit.state.rows.goal_students = (f) =>
    matchRows(
      [
        { profile_id: "s1", week_ideal: 10 },
        { profile_id: "s2", week_ideal: 10 },
      ],
      f,
    );
  kit.state.rows.goal_student_state = () => [];
  const rec = (
    profile_id: string,
    record_date: string,
    study_hours: number,
  ) => ({
    profile_id,
    record_date,
    study_hours,
    target_ideal_hours: 5,
    target_min_hours: 2,
  });
  kit.state.rows.goal_daily_records = (f) =>
    matchRows(
      [
        rec("s1", "2026-11-04", 5),
        rec("s1", "2026-11-03", 3),
        rec("s1", "2026-11-05", 100),
        rec("s1", "2026-10-01", 100),
        rec("s2", "2026-11-04", 1),
        rec("s2", "2026-11-03", 1),
      ],
      f,
    );
});

afterEach(() => vi.useRealTimers());

describe("GET /api/console/enrollment/summary", () => {
  test("school admin gets per-class totals, capacity and per-service counts for this year's active students", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    const body = res.body as { classes: Record<string, unknown>[] };
    expect(body.classes).toEqual([
      expect.objectContaining({
        classId: "c-1",
        grade: "고1",
        groupName: null,
        className: "1",
        homeroomName: "김담임",
        total: 3,
        capacity: 4,
        joined: 2,
        services: expect.objectContaining({ diagnosis: 1, goal: 2, growth: 0 }),
      }),
      expect.objectContaining({
        classId: "c-2",
        homeroomName: null,
        total: 1,
        capacity: null,
        joined: 1,
      }),
    ]);
  });

  test("class goal rate is the mean of members' weekly achievement over the 7 days ending yesterday (KST), null when nobody uses goal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));

    const res = await get();

    const body = res.body as {
      classes: { classId: string; goalRateAvg: number | null }[];
    };
    // s1 (5+3)/10 = 80%, s2 2/10 = 20%, 오늘(11-05) 기록은 세지 않는다
    expect(body.classes.find((c) => c.classId === "c-1")?.goalRateAvg).toBe(50);
    expect(
      body.classes.find((c) => c.classId === "c-2")?.goalRateAvg,
    ).toBeNull();
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-1"],
    });

    expect((await get()).status).toBe(403);
  });

  test("asOf is today's date in KST", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));

    const res = await get();

    expect((res.body as { asOf: string }).asOf).toBe("2026-11-06");
  });

  test("orgType tells the screen whether the tenant is a school or an academy", async () => {
    const res = await get();

    expect((res.body as { orgType: string }).orgType).toBe("학교");
  });
});
