// GET /api/console/students 계약 검증(W6 학생 관리). 담임은 담당 학급의 실명, 관리자는 전교의 가린 이름.

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

import handler from "./students.js";

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
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김하늘", created_at: "2026-03-02T01:00:00Z" },
        { id: "s2", name: "윤하린", created_at: "2026-03-04T01:00:00Z" },
        { id: "s3", name: "박서준", created_at: "2026-03-04T01:00:00Z" },
        { id: "s4", name: "이도윤", created_at: "2026-03-05T16:00:00Z" },
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
  kit.state.rows.diagnosis_reports = () => [];
});

type Item = { studentId: string; displayName: string };
const items = (r: { body: unknown }) => (r.body as { rows: Item[] }).rows;
const ids = (r: { body: unknown }) => items(r).map((i) => i.studentId);

describe("GET /api/console/students", () => {
  test("school admin gets the tenant's current students by grade, class and number (no class last) with masked names and read-only rows", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(["s3", "s2", "s1", "s4"]);
    expect(items(r).map((i) => i.displayName)).toEqual([
      "박*준",
      "윤*린",
      "김*늘",
      "이*윤",
    ]);
    expect(r.body).toMatchObject({
      total: 4,
      scopeTotal: 4,
      page: 1,
      pageSize: 50,
      orgType: "학원",
    });
    expect(items(r).some((i) => (i as { canEdit?: boolean }).canEdit)).toBe(
      false,
    );
  });

  test("a row carries the join date, the used services in order with their count, and the enrollment slot", async () => {
    const r = await get();
    const s1 = items(r).find((i) => i.studentId === "s1");
    const s3 = items(r).find((i) => i.studentId === "s3");

    expect(s1).toEqual({
      studentId: "s1",
      displayName: "김*늘",
      joinedAt: "2026-03-02",
      grade: "고2",
      groupName: null,
      className: "3",
      number: 7,
      services: {
        diagnosis: true,
        goal: true,
        growth: true,
        performance: false,
        selfeval: false,
        inquiry: false,
      },
      serviceCount: 3,
      urgency: null,
      canEdit: false,
      enrollmentVersion: 3,
    });
    expect(s3).toMatchObject({ groupName: "A레벨", serviceCount: 0 });
    // 협정 세계시 16시는 한국 시각으로 다음 날이다.
    expect(items(r).find((i) => i.studentId === "s4")).toMatchObject({
      joinedAt: "2026-03-06",
    });
  });

  test("a homeroom sees only students of own classes, with real names, and can edit them", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    const r = await get();

    expect(ids(r)).toEqual(["s2", "s1"]);
    expect(items(r).map((i) => i.displayName)).toEqual(["윤하린", "김하늘"]);
    expect(
      items(r).every((i) => (i as { canEdit?: boolean }).canEdit === true),
    ).toBe(true);
  });

  test("grade, groupId, classId and q narrow the list while scopeTotal stays the unfiltered count", async () => {
    const byGrade = await get({ grade: "고1" });
    expect(ids(byGrade)).toEqual(["s3"]);
    expect(byGrade.body).toMatchObject({ total: 1, scopeTotal: 4 });
    expect(ids(await get({ groupId: "g-1" }))).toEqual(["s3"]);
    expect(ids(await get({ classId: "c-A" }))).toEqual(["s2", "s1"]);
    expect(ids(await get({ q: "하린" }))).toEqual(["s2"]);
  });

  test("tab narrows to students who used that service, and none lists students with no service", async () => {
    expect(ids(await get({ tab: "growth" }))).toEqual(["s1"]);
    expect(ids(await get({ tab: "inquiry" }))).toEqual(["s2"]);
    expect(ids(await get({ tab: "none" }))).toEqual(["s3", "s4"]);
    expect(ids(await get({ tab: "all" }))).toHaveLength(4);
  });

  test("an unknown tab is a 400", async () => {
    expect((await get({ tab: "nope" })).status).toBe(400);
  });

  test("a homeroom asking for another teacher's class gets 404", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });

    expect((await get({ classId: "c-G" })).status).toBe(404);
  });

  test("pageSize and page slice the list", async () => {
    const r = await get({ pageSize: "3", page: "2" });
    expect(ids(r)).toEqual(["s4"]);
    expect(r.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
  });

  test("a malformed page is a 400", async () => {
    expect((await get({ page: "x" })).status).toBe(400);
  });
});
