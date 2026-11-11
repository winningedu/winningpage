// GET /api/console/teachers/accounts 계약 검증(W16 교사 계정 관리).
// 계정이 있는 교사만, 학교 관리자 먼저 이어서 학년과 반 순으로 싣는다.

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

import handler from "./accounts.js";

const T = "tenant-1";
const TEACHERS = [
  {
    id: "t-park",
    tenant_id: T,
    name: "박지훈",
    phone: "01012345678",
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
    phone: "01099995678",
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
    phone: "01000000000",
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
    phone: "01077770000",
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

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

describe("GET /api/console/teachers/accounts", () => {
  test("계정이 있는 교사만 학교 관리자 먼저, 이어서 학년과 반 순으로 담당 학급과 상태를 싣는다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    const body = r.body as { items: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(3);
    expect(body.items.map((i) => i.id)).toEqual(["t-choi", "t-park", "t-free"]);
    expect(body.items[0]).toMatchObject({
      name: "최민정",
      role: "school_admin",
      loginId: "SM26HB83R4TXW9",
      status: "active",
      classes: [],
    });
    expect(body.items[0]).not.toHaveProperty("phone");
    expect(body.items.map((i) => i.phoneLast4)).toEqual([
      "5678",
      "5678",
      "0000",
    ]);
    expect(body.items[1]).toMatchObject({
      name: "박지훈",
      role: "homeroom",
      status: "active",
      passwordSet: false,
      classes: [
        { id: "c-2-3", grade: "고2", name: "3", isPrimary: true },
        { id: "c-2-5", grade: "고2", name: "5", isPrimary: false },
      ],
    });
    expect(body.items[2]).toMatchObject({ status: "inactive" });
  });

  test("최근 로그인은 Auth 의 마지막 로그인 시각이고 한 번도 없거나 읽지 못하면 null 이다", async () => {
    kit.state.auth.getUserById.mockImplementation(async (id: string) => {
      if (id === "p-park") {
        return {
          data: { user: { last_sign_in_at: "2026-11-03T08:15:00Z" } },
          error: null,
        };
      }
      if (id === "p-free")
        return { data: { user: null }, error: { message: "x" } };
      return { data: { user: { last_sign_in_at: null } }, error: null };
    });

    const r = await get();

    const body = r.body as { items: Record<string, unknown>[] };
    expect(body.items.map((i) => [i.id, i.lastLoginAt])).toEqual([
      ["t-choi", null],
      ["t-park", "2026-11-03T08:15:00Z"],
      ["t-free", null],
    ]);
    expect(kit.state.auth.getUserById).toHaveBeenCalledTimes(3);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await get()).status).toBe(403);
  });
});
