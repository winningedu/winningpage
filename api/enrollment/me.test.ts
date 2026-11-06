// GET /api/enrollment/me 계약 검증.
// 학생 본인은 student_enrollments 를 읽을 수 있지만 학급 이름(classes)은 읽을 수 없어 서버가 이름까지 풀어 준다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./me.js";

const get = () => callHandler(handler, undefined, "GET");

const CLASSES = [
  {
    id: "c-3",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "3",
  },
  {
    id: "c-5",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고3",
    group_id: null,
    name: "5",
  },
];

// 본인 행 하나에 다른 학생, 다른 기관, 다른 학년도, 졸업 행을 섞어 두어 조회 조건이 맞는지 본다.
const ENROLLMENTS = [
  {
    student_id: "other",
    tenant_id: "tenant-1",
    school_year: 2026,
    status: "active",
    grade: "고1",
    class_id: "c-5",
    number: 1,
  },
  {
    student_id: "student-1",
    tenant_id: "tenant-2",
    school_year: 2026,
    status: "active",
    grade: "고1",
    class_id: "c-5",
    number: 2,
  },
  {
    student_id: "student-1",
    tenant_id: "tenant-1",
    school_year: 2025,
    status: "active",
    grade: "고1",
    class_id: "c-5",
    number: 3,
  },
  {
    student_id: "student-1",
    tenant_id: "tenant-1",
    school_year: 2026,
    status: "graduated",
    grade: "고1",
    class_id: "c-5",
    number: 4,
  },
  {
    student_id: "student-1",
    tenant_id: "tenant-1",
    school_year: 2026,
    status: "active",
    grade: "고2",
    class_id: "c-3",
    number: 12,
  },
];

const PENDING = {
  status: "pending",
  to_grade: "고3",
  to_class_id: "c-5",
  to_number: 7,
  created_at: "2026-11-05T01:00:00Z",
};
// 다른 학생, 다른 기관, 지난 학년도의 열린 신청은 본인 응답에 실리면 안 된다.
const CHANGES = [
  { ...PENDING, student_id: "other", tenant_id: "tenant-1", school_year: 2026 },
  {
    ...PENDING,
    student_id: "student-1",
    tenant_id: "tenant-2",
    school_year: 2026,
  },
  {
    ...PENDING,
    student_id: "student-1",
    tenant_id: "tenant-1",
    school_year: 2025,
  },
];

beforeEach(() => {
  // 테스트가 더한 행을 걷어 낸다.
  ENROLLMENTS.length = 5;
  CHANGES.length = 3;
  kit.state = createKitState();
  kit.state.user = { id: "student-1", email: "s@example.com" };
  kit.state.rows.profiles = () => ({ tenant_id: "tenant-1" });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
  kit.state.rows.class_groups = () => [];
  kit.state.rows.student_enrollments = (f) =>
    matchRows(ENROLLMENTS, f)[0] ?? null;
  kit.state.rows.enrollment_changes = (f) => matchRows(CHANGES, f)[0] ?? null;
});

describe("GET /api/enrollment/me", () => {
  test("returns this year's grade, class name and number with the institution type", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      orgType: "학교",
      enrollment: {
        schoolYear: 2026,
        grade: "고2",
        groupName: null,
        className: "3",
        number: 12,
      },
      pending: null,
    });
  });

  test("includes the open change request with its target class", async () => {
    CHANGES.push({
      ...PENDING,
      student_id: "student-1",
      tenant_id: "tenant-1",
      school_year: 2026,
    });

    const res = await get();

    expect((res.body as { pending: unknown }).pending).toEqual({
      grade: "고3",
      groupName: null,
      className: "5",
      number: 7,
      createdAt: "2026-11-05T01:00:00Z",
    });
  });

  test("ignores open requests of other students, other institutions and past school years", async () => {
    const res = await get();

    expect((res.body as { pending: unknown }).pending).toBeNull();
  });

  test("a student whose class was cleared by the rollover has a null class name and number", async () => {
    ENROLLMENTS.push({
      student_id: "student-1",
      tenant_id: "tenant-3",
      school_year: 2026,
      status: "active",
      grade: "고3",
      class_id: null as unknown as string,
      number: null as unknown as number,
    });
    kit.state.rows.profiles = () => ({ tenant_id: "tenant-3" });
    kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });

    const res = await get();

    expect((res.body as { enrollment: unknown }).enrollment).toEqual({
      schoolYear: 2026,
      grade: "고3",
      groupName: null,
      className: null,
      number: null,
    });
  });

  test("a student without an institution gets no enrollment", async () => {
    kit.state.rows.profiles = () => ({ tenant_id: null });

    const res = await get();

    expect(res.body).toEqual({
      ok: true,
      orgType: null,
      enrollment: null,
      pending: null,
    });
  });

  test("a read error is 500 INTERNAL", async () => {
    kit.state.rows.student_enrollments = () => {
      throw new Error("db down");
    };

    const res = await get();

    expect(res.status).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      "INTERNAL",
    );
  });
});
