// GET /api/console/students/detail 계약 검증(W6a 학생 상세). 실명으로 보이고 여는 일은 접근 로그에 남는다.

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

import handler from "./detail.js";

const get = (query: Record<string, string> = { studentId: "s1" }) =>
  callHandler(handler, undefined, "GET", query);

const ENROLLMENTS = [
  {
    tenant_id: "tenant-1",
    student_id: "s1",
    school_year: 2026,
    status: "active",
    grade: "고2",
    class_id: "c-A",
    number: 7,
    version: 3,
  },
  {
    tenant_id: "tenant-1",
    student_id: "s1",
    school_year: 2025,
    status: "promoted",
    grade: "고1",
    class_id: "c-old",
    number: 4,
    version: 1,
  },
  {
    tenant_id: "tenant-1",
    student_id: "s2",
    school_year: 2026,
    status: "active",
    grade: "고2",
    class_id: "c-B",
    number: 1,
    version: 1,
  },
];

const USAGE: Record<string, Record<string, unknown>> = {
  suhaeng: {
    allowed: true,
    deny_reason: null,
    month_used: 1,
    month_limit: null,
    month_remaining: null,
    term_used: 4,
    term_limit: 25,
    term_remaining: 21,
  },
  inquiry: {
    allowed: true,
    deny_reason: null,
    month_used: 0,
    month_limit: 3,
    month_remaining: 3,
    term_used: 0,
    term_limit: null,
    term_remaining: null,
  },
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-A",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "3",
        },
        {
          id: "c-B",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "5",
        },
        {
          id: "c-old",
          tenant_id: "tenant-1",
          school_year: 2025,
          grade: "고1",
          group_id: null,
          name: "5",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = () => [];
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김하늘", created_at: "2026-03-02T01:00:00Z" },
        { id: "s2", name: "윤하린", created_at: "2026-03-04T01:00:00Z" },
      ],
      f,
    );
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "s1" }], f);
  kit.state.rows.goal_students = () => [];
  kit.state.rows.growth_profiles = () => [];
  kit.state.rows.growth_reports = () => [];
  kit.state.rows.performance_sessions = () => [];
  kit.state.rows.selfeval_sessions = () => [];
  kit.state.rows.inquiry_sessions = () => [];
  kit.state.rpc.fn_tenant_usage_state = (args) => ({
    data: [USAGE[String(args.p_program_key)] ?? { allowed: true }],
    error: null,
  });
});

describe("GET /api/console/students/detail", () => {
  test("a school admin opens a student and sees the real name, the current slot and the class history newest first", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      studentId: "s1",
      name: "김하늘",
      joinedAt: "2026-03-02",
      enrollment: {
        grade: "고2",
        groupName: null,
        className: "3",
        number: 7,
      },
      history: [
        { schoolYear: 2026, grade: "고2", className: "3", number: 7 },
        { schoolYear: 2025, grade: "고1", className: "5", number: 4 },
      ],
    });
  });
});
