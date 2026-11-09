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
        {
          id: "s1",
          name: "김하늘",
          created_at: "2026-03-02T01:00:00Z",
          last_seen_at: "2026-11-06T14:50:00.000Z",
        },
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
  kit.state.rows.diagnosis_reports = () => [];
  kit.state.rows.student_flags = () => [];
  kit.state.rows.teacher_class_assignments = () => [];
  kit.state.rows.teachers = () => [];
  kit.state.rpc.fn_tenant_usage_state = (args) => ({
    data: [USAGE[String(args.p_program_key)] ?? { allowed: true }],
    error: null,
  });
});

describe("GET /api/console/students/detail", () => {
  test("lastSeenAt is the stored last access time and null when the student was never seen", async () => {
    expect((await get()).body).toMatchObject({
      lastSeenAt: "2026-11-06T14:50:00.000Z",
    });
    kit.state.rows.profiles = (f) =>
      matchRows([{ id: "s1", name: "김하늘", last_seen_at: null }], f);
    expect((await get()).body).toMatchObject({ lastSeenAt: null });
  });

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

  test("opening a student writes a view record to the access log", async () => {
    await get();

    expect(kit.state.inserts).toEqual([
      {
        table: "admin_access_logs",
        row: expect.objectContaining({
          action: "view",
          resource_key: "studentDetail",
          target_id: "s1",
          tenant_id: "tenant-1",
        }),
      },
    ]);
  });

  test("a missing studentId is a 400 and writes no log", async () => {
    expect((await get({})).status).toBe(400);
    expect(kit.state.inserts).toEqual([]);
  });

  test("an unknown student, another tenant's student and a homeroom's out-of-class student are 404 and not logged", async () => {
    expect((await get({ studentId: "nobody" })).status).toBe(404);
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    expect((await get({ studentId: "s2" })).status).toBe(404);
    expect((await get({ studentId: "s1" })).status).toBe(200);
    expect(kit.state.inserts).toHaveLength(1);
  });

  test("a student whose current school year row is not active (a graduate) is 404 and not logged", async () => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows(
        ENROLLMENTS.map((e) =>
          e.student_id === "s1" && e.school_year === 2026
            ? { ...e, status: "graduated" }
            : e,
        ),
        f,
      );

    expect((await get()).status).toBe(404);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a failing log write fails the request instead of opening the student unrecorded", async () => {
    kit.state.insertErrors.admin_access_logs = { message: "down" };

    expect((await get()).status).toBe(500);
  });

  test("services list the six keys in order with whether the student used them", async () => {
    const r = await get();

    expect((r.body as { services: unknown }).services).toEqual({
      diagnosis: true,
      goal: false,
      growth: false,
      performance: false,
      selfeval: false,
      inquiry: false,
    });
  });

  test("usage reports month and term counts per service from the tenant usage state, null where there is no limit", async () => {
    const r = await get();
    const usage = (r.body as { usage: { key: string }[] }).usage;

    expect(usage.map((u) => u.key)).toEqual([
      "diagnosis",
      "goal",
      "growth",
      "performance",
      "selfeval",
      "inquiry",
    ]);
    expect(usage.find((u) => u.key === "performance")).toEqual({
      key: "performance",
      monthUsed: 1,
      monthLimit: null,
      monthRemaining: null,
      termUsed: 4,
      termLimit: 25,
      termRemaining: 21,
    });
    expect(usage.find((u) => u.key === "inquiry")).toMatchObject({
      monthLimit: 3,
      monthRemaining: 3,
      termLimit: null,
    });
  });

  test("the info line carries the homeroom teacher name of the current class", async () => {
    kit.state.rows.teacher_class_assignments = (f) =>
      matchRows(
        [{ tenant_id: "tenant-1", class_id: "c-A", teacher_id: "t1" }],
        f,
      );
    kit.state.rows.teachers = (f) =>
      matchRows([{ id: "t1", tenant_id: "tenant-1", name: "박지훈" }], f);

    expect(
      (await get()).body as { enrollment: { homeroomName: string | null } },
    ).toMatchObject({ enrollment: { homeroomName: "박지훈" } });
    kit.state.rows.teacher_class_assignments = () => [];
    expect((await get()).body).toMatchObject({
      enrollment: { homeroomName: null },
    });
  });

  test("flagged tells whether the student is a special student", async () => {
    expect((await get()).body).toMatchObject({ flagged: false });
    kit.state.rows.student_flags = (f) =>
      matchRows([{ student_id: "s1", tenant_id: "tenant-1" }], f);

    expect((await get()).body).toMatchObject({ flagged: true });
  });

  test("summaries describe each used service from its own records and are null for unused ones", async () => {
    const mine =
      (rows: Record<string, unknown>[]) => (f: Record<string, unknown>) =>
        matchRows(rows, f);
    kit.state.rows.diagnosis_reports = mine([
      {
        attempt_id: "a1",
        profile_id: "s1",
        diagnosed_at: "2026-06-01T00:00:00Z",
        payload: {
          learningAxes: [{ name: "축1", score: 10, status: "낮음" }],
          readiness: {
            areas: [
              { name: "영역1", score: 70, status: "높음" },
              { name: "영역2", score: 72, status: "높음" },
            ],
          },
        },
      },
    ]);
    kit.state.rows.goal_students = mine([
      {
        profile_id: "s1",
        ideal_university: "가나대",
        ideal_department: "경영학과",
        min_university: "다라대",
        min_department: "경영학과",
      },
    ]);
    kit.state.rows.growth_reports = mine([
      {
        id: "g0",
        profile_id: "s1",
        narrative_theme: "옛 주제",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "g1",
        profile_id: "s1",
        narrative_theme: "지속가능한 도시",
        created_at: "2026-05-01T00:00:00Z",
      },
    ]);
    kit.state.rows.performance_sessions = mine([
      { id: "p1", profile_id: "s1", status: "completed" },
      { id: "p2", profile_id: "s1", status: "completed" },
      { id: "p3", profile_id: "s1", status: "in_progress" },
    ]);
    kit.state.rows.selfeval_sessions = mine([
      { id: "e1", profile_id: "s1", status: "completed" },
    ]);
    kit.state.rows.inquiry_sessions = mine([
      {
        id: "i1",
        profile_id: "s1",
        status: "completed",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "i2",
        profile_id: "s1",
        status: "in_progress",
        created_at: "2026-04-01T00:00:00Z",
      },
    ]);

    const r = await get();

    expect((r.body as { summaries: unknown }).summaries).toEqual({
      diagnosis: "학교생활 준비도 71",
      goal: "이상 가나대 경영학과, 최소 다라대 경영학과",
      growth: '대주제 "지속가능한 도시"',
      performance: "제출 2건, 진행 중 1건",
      selfeval: "제출 1건",
      inquiry: "진행 중",
    });
  });

  test("a service the student never used has no summary", async () => {
    expect((await get()).body).toMatchObject({
      summaries: {
        goal: null,
        growth: null,
        performance: null,
        selfeval: null,
        inquiry: null,
      },
    });
  });
});
