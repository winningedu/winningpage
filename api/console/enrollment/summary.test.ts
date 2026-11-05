// GET /api/console/enrollment/summary 계약 검증(W7 이용현황). 학교 관리자 전용, 반별 총원과 서비스별 이용 인원.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
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
    matchRows([{ profile_id: "s1" }, { profile_id: "s2" }], f);
});

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
});
