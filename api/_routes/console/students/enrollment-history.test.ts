// GET /api/console/students/enrollment-history 계약 검증(W13a 학년도별 이력 창). 이름은 창 제목에 실명으로 쓴다(결정 35).

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

import handler from "./enrollment-history.js";

const get = (query: Record<string, string>) =>
  callHandler(handler, undefined, "GET", query);

const row = (over: Record<string, unknown>) => ({
  tenant_id: "tenant-1",
  status: "active",
  number: null,
  ...over,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        row({
          id: "e1",
          student_id: "s1",
          school_year: 2026,
          grade: "고2",
          class_id: "c-A",
          number: 1,
        }),
        row({
          id: "e2",
          student_id: "s1",
          school_year: 2025,
          grade: "고1",
          class_id: "c-old",
          number: 4,
        }),
        row({
          id: "e3",
          student_id: "s2",
          school_year: 2026,
          grade: "고2",
          class_id: "c-Z",
          number: 2,
        }),
        row({
          id: "e4",
          student_id: "s3",
          school_year: 2026,
          grade: null,
          class_id: null,
        }),
        row({
          id: "e5",
          student_id: "s4",
          tenant_id: "tenant-2",
          school_year: 2026,
          grade: "고2",
          class_id: "c-X",
        }),
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
          group_id: "g-1",
          name: "3",
        },
        {
          id: "c-old",
          tenant_id: "tenant-1",
          school_year: 2025,
          grade: "고1",
          group_id: null,
          name: "5",
        },
        {
          id: "c-Z",
          tenant_id: "tenant-1",
          school_year: 2026,
          grade: "고2",
          group_id: null,
          name: "9",
        },
      ],
      f,
    );
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.profiles = (f) =>
    matchRows(
      [
        { id: "s1", name: "김서연" },
        { id: "s2", name: "한예준" },
      ],
      f,
    );
  kit.state.rows.performance_sessions = (f) =>
    matchRows([{ id: "p1", profile_id: "s1" }], f);
  kit.state.rows.selfeval_sessions = (f) =>
    matchRows([{ id: "v1", profile_id: "s1" }], f);
  kit.state.rows.goal_students = (f) => matchRows([{ profile_id: "s1" }], f);
  for (const t of [
    "diagnosis_attempts",
    "growth_profiles",
    "growth_reports",
    "inquiry_sessions",
  ]) {
    kit.state.rows[t] = () => [];
  }
});

describe("GET /api/console/students/enrollment-history", () => {
  test("school admin gets the real name, the linked services in display order and the years newest first with the current one flagged", async () => {
    const r = await get({ studentId: "s1" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      studentId: "s1",
      name: "김서연",
      linkedServices: ["goal", "performance", "selfeval"],
      years: [
        {
          schoolYear: 2026,
          grade: "고2",
          groupName: "A레벨",
          className: "3",
          number: 1,
          current: true,
        },
        {
          schoolYear: 2025,
          grade: "고1",
          groupName: null,
          className: "5",
          number: 4,
          current: false,
        },
      ],
      canOpenCoaching: true,
    });
  });

  test("a student without a class still has a year row with empty class fields", async () => {
    const r = await get({ studentId: "s3" });
    expect(r.status).toBe(200);
    expect((r.body as { years: unknown[] }).years).toEqual([
      {
        schoolYear: 2026,
        grade: null,
        groupName: null,
        className: null,
        number: null,
        current: true,
      },
    ]);
  });

  test("a homeroom reads a student of own class and may open coaching", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    const r = await get({ studentId: "s1" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ canOpenCoaching: true });
  });

  test("a homeroom cannot read a student of another class, the pool, another tenant or a missing one (404)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    for (const studentId of ["s2", "s3", "s4", "ghost"]) {
      expect(await get({ studentId })).toMatchObject({
        status: 404,
        body: { error: { code: "NOT_FOUND" } },
      });
    }
  });

  test("a school admin cannot read another tenant's student (404)", async () => {
    expect((await get({ studentId: "s4" })).status).toBe(404);
  });

  test("a missing studentId is a 400", async () => {
    expect((await get({})).status).toBe(400);
  });
});
