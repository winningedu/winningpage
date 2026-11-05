// GET /api/console/students/history 계약 검증(W13 학생 조회와 이력). 담임은 담당 학급의 실명, 관리자는 전교의 가린 이름.

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

import handler from "./history.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const row = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  grade: null,
  class_id: null,
  number: null,
  version: 1,
  ...over,
});

const ENROLLMENTS = [
  row({
    id: "e1",
    student_id: "s1",
    grade: "고2",
    class_id: "c-A",
    number: 7,
    version: 3,
  }),
  row({ id: "e2", student_id: "s2", grade: "고2", class_id: "c-A", number: 1 }),
  row({
    id: "e3",
    student_id: "s3",
    grade: "고1",
    class_id: "c-G",
    number: null,
  }),
  row({ id: "e4", student_id: "s4" }),
  row({
    id: "e5",
    student_id: "s5",
    grade: "고3",
    class_id: "c-A",
    status: "graduated",
  }),
  row({
    id: "e6",
    student_id: "s6",
    tenant_id: "tenant-2",
    grade: "고2",
    class_id: "c-X",
    number: 2,
  }),
  row({
    id: "e7",
    student_id: "s1",
    school_year: 2025,
    grade: "고1",
    class_id: "c-old",
    number: 4,
  }),
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
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
          id: "c-G",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고1",
          group_id: "g-1",
          name: "1",
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
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김하늘" },
        { id: "s2", name: "윤하린" },
        { id: "s3", name: "박서준" },
        { id: "s4", name: "이도윤" },
      ],
      f,
    );
  // s1: 학습진단, 목표관리, 성장설계(프로필과 리포트 둘 다 있어도 한 번). s2: 심화탐구 하나.
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "s1" }], f);
  kit.state.rows.goal_students = (f) => matchRows([{ profile_id: "s1" }], f);
  kit.state.rows.growth_profiles = (f) => matchRows([{ profile_id: "s1" }], f);
  kit.state.rows.growth_reports = (f) =>
    matchRows([{ id: "g1", profile_id: "s1" }], f);
  kit.state.rows.performance_sessions = () => [];
  kit.state.rows.selfeval_sessions = () => [];
  kit.state.rows.inquiry_sessions = (f) =>
    matchRows([{ id: "i1", profile_id: "s2" }], f);
});

type Item = { studentId: string; name: string };
const ids = (r: { body: unknown }) =>
  (r.body as { items: Item[] }).items.map((i) => i.studentId);

describe("GET /api/console/students/history", () => {
  test("school admin gets the whole tenant's current students by grade, class and number (no class last), names masked", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["s3", "s2", "s1", "s4"]);
    expect(r.body).toMatchObject({ total: 4, page: 1, pageCount: 1 });
    expect((r.body as { items: Item[] }).items.map((i) => i.name)).toEqual([
      "박*준",
      "윤*린",
      "김*늘",
      "이*윤",
    ]);
  });

  test("same masked names in one class get a trailing star, another class does not", async () => {
    const extra = [
      row({
        id: "e9",
        student_id: "s9",
        grade: "고2",
        class_id: "c-A",
        number: 9,
      }),
      row({
        id: "e10",
        student_id: "s10",
        grade: "고1",
        class_id: "c-G",
        number: 2,
      }),
    ];
    kit.state.rows.student_enrollments = (f) =>
      matchRows([...ENROLLMENTS, ...extra], f);
    const baseProfiles = kit.state.rows.profiles;
    kit.state.rows.profiles = (f) => [
      ...(baseProfiles?.(f) as { id: string; name: string }[]),
      ...matchRows(
        [
          { id: "s9", name: "김지늘" },
          { id: "s10", name: "김가늘" },
        ],
        f,
      ),
    ];

    const r = await get();

    const name = (id: string) =>
      (r.body as { items: Item[] }).items.find((i) => i.studentId === id)?.name;
    expect(name("s1")).toBe("김*늘*");
    expect(name("s9")).toBe("김*늘*");
    expect(name("s10")).toBe("김*늘");
  });

  test("an item carries the current grade and group, the class history newest first, the service count and the enrollment with its version", async () => {
    const r = await get();
    const s1 = (r.body as { items: { studentId: string }[] }).items.find(
      (i) => i.studentId === "s1",
    );

    expect(s1).toEqual({
      studentId: "s1",
      name: "김*늘",
      grade: "고2",
      groupName: null,
      history: [
        { schoolYear: 2026, grade: "고2", groupName: null, className: "3" },
        { schoolYear: 2025, grade: "고1", groupName: null, className: "5" },
      ],
      servicesUsed: 3,
      servicesTotal: 6,
      enrollment: {
        grade: "고2",
        groupId: null,
        classId: "c-A",
        className: "3",
        number: 7,
        version: 3,
      },
    });
    const s3 = (
      r.body as {
        items: {
          studentId: string;
          groupName: string | null;
          servicesUsed: number;
        }[];
      }
    ).items.find((i) => i.studentId === "s3");
    expect(s3).toMatchObject({ groupName: "A레벨", servicesUsed: 0 });
  });

  test("grade, groupId, classId and q narrow the list (q matches the real name)", async () => {
    expect(ids(await get({ grade: "고1" }))).toEqual(["s3"]);
    expect(ids(await get({ groupId: "g-1" }))).toEqual(["s3"]);
    expect(ids(await get({ classId: "c-A" }))).toEqual(["s2", "s1"]);
    expect(ids(await get({ q: "하린" }))).toEqual(["s2"]);
  });

  test("a homeroom sees only students of own classes, with real names", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    const r = await get();

    expect(ids(r)).toEqual(["s2", "s1"]);
    expect((r.body as { items: Item[] }).items.map((i) => i.name)).toEqual([
      "윤하린",
      "김하늘",
    ]);
  });

  test("pageSize and page slice the list", async () => {
    const r = await get({ pageSize: "3", page: "2" });
    expect(ids(r)).toEqual(["s4"]);
    expect(r.body).toMatchObject({ total: 4, page: 2, pageCount: 2 });
  });

  test("a malformed page is a 400", async () => {
    expect((await get({ page: "x" })).status).toBe(400);
  });

  test("tables without an id column are ordered by their own key", async () => {
    await get();
    expect(kit.state.orders).toContainEqual({
      table: "goal_students",
      column: "profile_id",
    });
    expect(kit.state.orders).toContainEqual({
      table: "growth_profiles",
      column: "profile_id",
    });
  });
});
