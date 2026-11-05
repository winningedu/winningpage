// GET /api/console/assign-pool 계약 검증(W12 미배정 목록). 학교 관리자 전용, 이름은 가리고 동명 재학생을 함께 준다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
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
  (r.body as { rows: PoolRow[] }).rows.map((i) => i.studentId);

describe("GET /api/console/assign-pool", () => {
  test("lists current active students with no grade or no class, masked, with their version", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r).sort()).toEqual(["p1", "p2", "p3"]);
    expect(r.body).toMatchObject({ total: 3, page: 1, pageSize: 50 });
    expect(
      (r.body as { rows: { studentId: string }[] }).rows.find(
        (i) => i.studentId === "p1",
      ),
    ).toMatchObject({
      name: "김*늘",
      enrollmentVersion: 4,
      grade: null,
    });
  });

  test("a pool student carries the same-name enrolled students with their slot and used service count", async () => {
    const r = await get({ q: "하늘" });
    const p1 = (
      r.body as {
        rows: {
          studentId: string;
          sameNameCount: number;
          sameNameEnrolled: unknown[];
        }[];
      }
    ).rows[0];

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
      rows: [{ studentId: "p2", sameNameCount: 0, sameNameEnrolled: [] }],
    });
  });

  test("grade and q narrow the list, an empty pool is total 0", async () => {
    expect(ids(await get({ grade: "고2" }))).toEqual(["p2"]);
    const none = await get({ q: "없는이름" });
    expect(none.body).toMatchObject({ total: 0, rows: [] });
  });

  test("a homeroom teacher is refused", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    expect((await get()).status).toBe(403);
  });

  test("pageSize and page slice the list and a malformed page is a 400", async () => {
    const r = await get({ pageSize: "2", page: "2" });
    expect(ids(r)).toHaveLength(1);
    expect(r.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect((await get({ page: "x" })).status).toBe(400);
  });
});
