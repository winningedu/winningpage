// GET /api/console/teachers/unissued 계약 검증(W16b 담임교사용 선택지).
// 교사 정보는 있고 계정이 없는 담임만, 전화번호는 뒷 네 자리만 싣는다.

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

import handler from "./unissued.js";

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
    phone: "01012341234",
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

const get = () => callHandler(handler, undefined, "GET");

describe("GET /api/console/teachers/unissued", () => {
  test("계정이 없는 담임만 이름, 첫 학급, 전화번호 뒷 네 자리로 싣고 전체 번호는 싣지 않는다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          id: "t-lee",
          name: "이수민",
          phoneLast4: "1234",
          classes: [{ grade: "고1", groupName: "A레벨", name: "2" }],
        },
      ],
    });
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await get()).status).toBe(403);
  });
});
