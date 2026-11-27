// GET /api/console/assign-pool 계약 검증(W12 미배정 목록). 학교 관리자, 본사 대행, 담임이 같은 풀을 실명으로 보고 동명 재학생을 함께 받는다.

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

import handler from "./assign-pool.js";

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
  needs_confirm: false,
  ...over,
});

const ENROLLMENTS = [
  // 미배정: 학년 없음, 학년만 있고 반 없음
  row({ student_id: "p1", version: 4 }),
  row({ student_id: "p2", grade: "고2" }),
  row({ student_id: "p3", grade: "고1" }),
  // 반이 있는 재학생(동명 후보)
  row({
    student_id: "e1",
    grade: "고2",
    class_id: "c-A",
    number: 7,
  }),
  row({
    student_id: "e2",
    grade: "고1",
    class_id: "c-G",
    number: 4,
  }),
  // 제외: 졸업, 지난 학년도, 다른 기관
  row({ student_id: "x1", status: "graduated" }),
  row({ student_id: "x2", school_year: 2025 }),
  row({ student_id: "x3", tenant_id: "tenant-2" }),
];

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
          id: "c-G",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고1",
          group_id: "g-1",
          name: "1",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "p1", name: "김하늘" },
        { id: "p2", name: "노윤서" },
        { id: "p3", name: "전지윤" },
        { id: "e1", name: "김하늘" },
        { id: "e2", name: "김하늘" },
      ],
      f,
    );
  kit.state.rows.diagnosis_attempts = (f) =>
    matchRows([{ id: "d1", profile_id: "e1" }], f);
  kit.state.rows.goal_students = (f) => matchRows([{ profile_id: "e1" }], f);
  kit.state.rows.growth_profiles = () => [];
  kit.state.rows.growth_reports = () => [];
  kit.state.rows.performance_sessions = () => [];
  kit.state.rows.selfeval_sessions = () => [];
  kit.state.rows.inquiry_sessions = (f) =>
    matchRows([{ id: "i1", profile_id: "e2" }], f);
});

type PoolRow = { studentId: string };
const ids = (r: { body: unknown }) =>
  (r.body as { items: PoolRow[] }).items.map((i) => i.studentId);

describe("GET /api/console/assign-pool", () => {
  test("lists current active students with no grade or no class, with real names and their version", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r).sort()).toEqual(["p1", "p2", "p3"]);
    expect(r.body).toMatchObject({ total: 3, page: 1, pageSize: 50 });
    expect(
      (r.body as { items: { studentId: string }[] }).items.find(
        (i) => i.studentId === "p1",
      ),
    ).toMatchObject({
      name: "김하늘",
      enrollmentVersion: 4,
      grade: null,
    });
  });

  test("a pool student carries the same-name enrolled students with their slot and used service count", async () => {
    const r = await get({ q: "김하늘" });
    const p1 = (
      r.body as {
        items: {
          studentId: string;
          sameNameCount: number;
          sameNameEnrolled: unknown[];
        }[];
      }
    ).items[0];

    expect(p1?.studentId).toBe("p1");
    expect(p1?.sameNameCount).toBe(2);
    expect(p1?.sameNameEnrolled).toEqual([
      {
        grade: "고2",
        groupName: null,
        className: "3",
        number: 7,
        usedServiceCount: 2,
        serviceTotal: 6,
      },
      {
        grade: "고1",
        groupName: "A레벨",
        className: "1",
        number: 4,
        usedServiceCount: 1,
        serviceTotal: 6,
      },
    ]);
  });

  test("a student with no same-name enrolled student has count 0", async () => {
    const r = await get({ q: "노윤서" });
    expect(r.body).toMatchObject({
      items: [{ studentId: "p2", sameNameCount: 0, sameNameEnrolled: [] }],
    });
  });

  test("grade and q narrow the list, an empty pool is total 0", async () => {
    expect(ids(await get({ grade: "고2" }))).toEqual(["p2"]);
    const none = await get({ q: "없는이름" });
    expect(none.body).toMatchObject({ total: 0, items: [] });
  });

  test.each([
    ["school_admin", {}],
    ["hq_proxy", { kind: "hq_proxy" }],
    ["homeroom", { kind: "homeroom", class_ids: ["c-A"] }],
  ])("%s sees real names and q is a partial match", async (_kind, actor) => {
    kit.state.actor = schoolAdminActor(actor);

    expect(ids(await get({ q: "하늘" }))).toEqual(["p1"]);
    expect(ids(await get({ q: "윤" })).sort()).toEqual(["p2", "p3"]);
    const r = await get({ q: "김하" });
    expect(r.body).toMatchObject({
      items: [{ studentId: "p1", name: "김하늘" }],
    });
  });

  test("a homeroom teacher gets the whole tenant pool, not only own classes", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    const r = await get();
    expect(r.status).toBe(200);
    expect(ids(r).sort()).toEqual(["p1", "p2", "p3"]);
  });

  test("pageSize and page slice the list and a malformed page is a 400", async () => {
    const r = await get({ pageSize: "2", page: "2" });
    expect(ids(r)).toHaveLength(1);
    expect(r.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect((await get({ page: "x" })).status).toBe(400);
  });

  test("pool students with the same name keep the plain real name", async () => {
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "p1", name: "김하늘" },
          { id: "p2", name: "김하늘" },
          { id: "p3", name: "전지윤" },
        ],
        f,
      );

    const r = await get();
    const names = (
      r.body as { items: { studentId: string; name: string }[] }
    ).items.map((i) => i.name);

    expect(names.sort()).toEqual(["김하늘", "김하늘", "전지윤"]);
  });

  test("classId narrows only the same-name enrolled lookup, pool membership is unchanged", async () => {
    const r = await get({ q: "김하늘", classId: "c-G" });
    const body = r.body as {
      items: {
        studentId: string;
        sameNameCount: number;
        sameNameEnrolled: { className: string }[];
      }[];
    };

    expect(r.status).toBe(200);
    expect(body.items.map((i) => i.studentId)).toEqual(["p1"]);
    expect(body.items[0]?.sameNameCount).toBe(1);
    expect(body.items[0]?.sameNameEnrolled.map((s) => s.className)).toEqual([
      "1",
    ]);
    expect(ids(await get({ classId: "c-G" })).sort()).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  test("a classId from another tenant matches no enrolled student and leaks nothing", async () => {
    const r = await get({ q: "김하늘", classId: "c-other-tenant" });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      items: [{ studentId: "p1", sameNameCount: 0, sameNameEnrolled: [] }],
    });
  });
});

describe("GET /api/console/assign-pool: 확인 필요 학생", () => {
  const UNCONFIRMED = [
    row({
      student_id: "u1",
      grade: "고1",
      class_id: "c-G",
      number: 5,
      needs_confirm: true,
      version: 2,
    }),
    row({
      student_id: "u2",
      grade: "고2",
      class_id: "c-A",
      number: 9,
      needs_confirm: true,
    }),
  ];
  beforeEach(() => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows([...ENROLLMENTS, ...UNCONFIRMED], f);
    const base = kit.state.rows.profiles;
    kit.state.rows.profiles = (f) => [
      ...((base?.(f) as unknown[]) ?? []),
      ...matchRows(
        [
          { id: "u1", name: "가나다" },
          { id: "u2", name: "하윤" },
        ],
        f,
      ),
    ];
  });

  test("lists unconfirmed students first, with the class they typed", async () => {
    const r = await get();
    const body = r.body as { total: number; items: Record<string, unknown>[] };

    expect(r.status).toBe(200);
    expect(body.total).toBe(5);
    expect(body.items.slice(0, 2).map((i) => i.studentId)).toEqual([
      "u1",
      "u2",
    ]);
    expect(body.items[0]).toMatchObject({
      studentId: "u1",
      name: "가나다",
      needsConfirm: true,
      canConfirm: true,
      enrollmentVersion: 2,
      grade: "고1",
      classId: "c-G",
      groupName: "A레벨",
      className: "1",
      number: 5,
    });
  });

  test("classless students keep their shape with needsConfirm false and no class", async () => {
    const r = await get({ q: "노윤서" });
    expect(r.body).toMatchObject({
      items: [
        {
          studentId: "p2",
          needsConfirm: false,
          classId: null,
          groupName: null,
          className: null,
          number: null,
        },
      ],
    });
  });

  test("grade, q and paging work for unconfirmed students too", async () => {
    expect(ids(await get({ grade: "고2" }))).toEqual(["u2", "p2"]);
    expect(ids(await get({ q: "가나" }))).toEqual(["u1"]);
    const page2 = await get({ pageSize: "2", page: "2" });
    expect(page2.body).toMatchObject({ total: 5, page: 2 });
    expect(ids(page2)).not.toContain("u1");
  });

  test("a homeroom teacher can confirm only students in own classes", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    const r = await get();
    const items = (r.body as { items: Record<string, unknown>[] }).items;
    expect(items.find((i) => i.studentId === "u1")?.canConfirm).toBe(false);
    expect(items.find((i) => i.studentId === "u2")?.canConfirm).toBe(true);
  });

  test("an unconfirmed student is not their own same-name enrolled student", async () => {
    kit.state.rows.profiles = (f) =>
      matchRows(
        [
          { id: "u1", name: "김하늘" },
          { id: "e1", name: "김하늘" },
        ],
        f,
      );
    const r = await get({ q: "김하늘" });
    const u1 = (
      r.body as { items: { studentId: string; sameNameCount: number }[] }
    ).items.find((i) => i.studentId === "u1");
    expect(u1?.sameNameCount).toBe(1);
  });
});
