// GET /api/console/coaching/students 계약 검증(W9 학생 고르기). 범위 안 재학생과 처음 열 학생.

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

import handler from "./students.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const row = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  grade: "고2",
  class_id: "c-A",
  number: 1,
  ...over,
});

type Body = {
  students: {
    studentId: string;
    name: string;
    classId: string | null;
    usesDiagnosis: boolean;
    usesGoal: boolean;
  }[];
  defaultStudentId: string | null;
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        row({ student_id: "s1", number: 7 }),
        row({ student_id: "s2", number: 2 }),
        row({ student_id: "s3", class_id: "c-B", number: 1 }),
        row({ student_id: "s4", status: "graduated" }),
        row({ student_id: "s5", tenant_id: "tenant-2", class_id: "c-X" }),
      ],
      f,
    );
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
          name: "4",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = () => [];
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김서연" },
        { id: "s2", name: "윤하린" },
        { id: "s3", name: "이서준" },
      ],
      f,
    );
  // s1 은 학습진단과 목표관리를 모두 쓰고, s2 는 학습진단만 쓴다.
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows(
      [
        { id: "d1", profile_id: "s1" },
        { id: "d2", profile_id: "s2" },
      ],
      f,
    );
  kit.state.rows.goal_students = (f) => matchRows([{ profile_id: "s1" }], f);
  for (const t of [
    "growth_profiles",
    "growth_reports",
    "performance_sessions",
    "selfeval_sessions",
    "inquiry_sessions",
  ]) {
    kit.state.rows[t] = () => [];
  }
});

describe("GET /api/console/coaching/students", () => {
  test("a school admin gets the tenant's active students by grade, class and number with masked names", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const body = r.body as Body;
    expect(body.students.map((s) => s.studentId)).toEqual(["s2", "s1", "s3"]);
    expect(body.students.map((s) => s.name)).toEqual([
      "윤*린",
      "김*연",
      "이*준",
    ]);
    expect(body.students[1]).toMatchObject({
      grade: "고2",
      className: "3",
      classId: "c-A",
      number: 7,
      usesDiagnosis: true,
      usesGoal: true,
    });
  });

  test("a homeroom gets only the own classes with real names", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-B"],
    });
    const body = (await get()).body as Body;
    expect(body.students.map((s) => [s.studentId, s.name])).toEqual([
      ["s3", "이서준"],
    ]);
  });

  test("the first student to open is the first one who uses both the diagnosis and the goal service, else the first student", async () => {
    expect(((await get()).body as Body).defaultStudentId).toBe("s1");
    kit.state.rows.goal_students = () => [];
    expect(((await get()).body as Body).defaultStudentId).toBe("s2");
  });

  test("no student leaves the default empty", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-none"],
    });
    const body = (await get()).body as Body;
    expect(body).toEqual({ students: [], defaultStudentId: null });
  });

  test("q matches the real name on the server before the name is masked", async () => {
    const body = (await get({ q: "이서준" })).body as Body;
    expect(body.students.map((s) => [s.studentId, s.name])).toEqual([
      ["s3", "이*준"],
    ]);
    const none = (await get({ q: "없는이름" })).body as Body;
    expect(none).toEqual({ students: [], defaultStudentId: null });
  });

  test("a non-homeroom actor's q matches only the exact full name, a homeroom keeps the partial match (decision 61)", async () => {
    expect(((await get({ q: "서준" })).body as Body).students).toEqual([]);
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-B"],
    });
    const body = (await get({ q: "서준" })).body as Body;
    expect(body.students.map((s) => s.studentId)).toEqual(["s3"]);
  });

  test("q does not widen the scope of a homeroom", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-B"],
    });
    const body = (await get({ q: "서연" })).body as Body;
    expect(body.students).toEqual([]);
  });
});
