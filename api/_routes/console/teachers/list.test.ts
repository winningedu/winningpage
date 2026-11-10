// GET /api/console/teachers/list 계약 검증(W14 교사 목록, W14e 선택 삭제 후보).
// 담당 학급마다 한 줄, 담임 없는 학급은 teacher null, 학교 관리자만 읽는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
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

import handler from "./list.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const T = "tenant-1";
const TEACHERS = [
  {
    id: "t-park",
    tenant_id: T,
    name: "박지훈",
    role: "homeroom",
    status: "active",
    login_id: "SM26HB83K7MPQ2",
    profile_id: "p-park",
    deleted_at: null,
  },
  {
    id: "t-lee",
    tenant_id: T,
    name: "이수민",
    role: "homeroom",
    status: "active",
    login_id: "SM26HB83W5ZQ7H",
    profile_id: null,
    deleted_at: null,
  },
  {
    id: "t-choi",
    tenant_id: T,
    name: "최민정",
    role: "school_admin",
    status: "active",
    login_id: "SM26HB83R4TXW9",
    profile_id: "p-choi",
    deleted_at: null,
  },
  {
    id: "t-gone",
    tenant_id: T,
    name: "삭제된선생",
    role: "homeroom",
    status: "active",
    login_id: null,
    profile_id: null,
    deleted_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "t-free",
    tenant_id: T,
    name: "한반없음",
    role: "homeroom",
    status: "inactive",
    login_id: "SM26HB83F1FREE",
    profile_id: "p-free",
    deleted_at: null,
  },
];
const CLASSES = [
  {
    id: "c-2-3",
    tenant_id: T,
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "3",
  },
  {
    id: "c-2-5",
    tenant_id: T,
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "5",
  },
  {
    id: "c-1-2",
    tenant_id: T,
    school_year: 2026,
    grade: "고1",
    group_id: "g-a",
    name: "2",
  },
  {
    id: "c-1-1",
    tenant_id: T,
    school_year: 2026,
    grade: "고1",
    group_id: null,
    name: "1",
  },
  {
    id: "c-old",
    tenant_id: T,
    school_year: 2025,
    grade: "고3",
    group_id: null,
    name: "1",
  },
];
const ASSIGNMENTS = [
  { tenant_id: T, teacher_id: "t-park", class_id: "c-2-3", is_primary: true },
  { tenant_id: T, teacher_id: "t-park", class_id: "c-2-5", is_primary: false },
  { tenant_id: T, teacher_id: "t-lee", class_id: "c-1-2", is_primary: true },
];
const ENROLLMENTS = [
  { tenant_id: T, school_year: 2026, status: "active", class_id: "c-2-3" },
  { tenant_id: T, school_year: 2026, status: "active", class_id: "c-2-3" },
  { tenant_id: T, school_year: 2026, status: "active", class_id: "c-2-5" },
  { tenant_id: T, school_year: 2026, status: "active", class_id: "c-1-2" },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.teachers = (f) => matchRows(TEACHERS, f);
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-a", tenant_id: T, name: "A레벨" }], f);
  kit.state.rows.teacher_class_assignments = (f) => matchRows(ASSIGNMENTS, f);
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
});

describe("GET /api/console/teachers/list", () => {
  test("한 줄이 담당 학급 하나이고 학년, 그룹, 반 순이며 담임 없는 학급은 teacher 가 null 이다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    const body = r.body as { items: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(5);
    expect(body.items.map((i) => i.classId)).toEqual([
      "c-1-1",
      "c-1-2",
      "c-2-3",
      "c-2-5",
      null,
    ]);
    expect(body.items[0]).toMatchObject({
      grade: "고1",
      className: "1",
      activeStudents: 0,
      teacher: null,
      loginId: null,
      accountStatus: null,
    });
    expect(body.items[1]).toMatchObject({
      groupName: "A레벨",
      activeStudents: 1,
      teacher: { id: "t-lee", name: "이수민" },
      loginId: "SM26HB83W5ZQ7H",
      accountStatus: "unissued",
      classCount: 1,
    });
    expect(body.items[2]).toMatchObject({
      activeStudents: 2,
      teacher: { id: "t-park", name: "박지훈" },
      accountStatus: "active",
      classCount: 2,
    });
  });
  test("학년으로 거르면 그 학년 학급만 남고 학급 없는 담임 줄은 빠진다", async () => {
    const r = await get({ grade: "고2" });

    const body = r.body as {
      items: { classId: string | null }[];
      total: number;
    };
    expect(body.items.map((i) => i.classId)).toEqual(["c-2-3", "c-2-5"]);
    expect(body.total).toBe(2);
  });

  test("teachers 는 삭제되지 않은 학교 관리자까지 재학생 수 합계와 담당 학급을 싣는다", async () => {
    const r = await get();

    const body = r.body as { teachers: Record<string, unknown>[] };
    expect(body.teachers.map((t) => t.id).sort()).toEqual([
      "t-choi",
      "t-free",
      "t-lee",
      "t-park",
    ]);
    expect(body.teachers.find((t) => t.id === "t-park")).toMatchObject({
      role: "homeroom",
      hasAccount: true,
      activeStudents: 3,
      classes: [
        { grade: "고2", groupId: null, groupName: null, name: "3" },
        { grade: "고2", groupId: null, groupName: null, name: "5" },
      ],
    });
    expect(body.teachers.find((t) => t.id === "t-choi")).toMatchObject({
      role: "school_admin",
      status: "active",
      classes: [],
    });
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await get()).status).toBe(403);
  });

  test("page 형식이 틀리면 400 이다", async () => {
    expect((await get({ page: "0" })).status).toBe(400);
  });
});
