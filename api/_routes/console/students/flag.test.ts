// POST, DELETE /api/console/students/flag 계약 검증(W6a 특이학생 지정과 해제, 사 #147).

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

import handler from "./flag.js";

const call = (method: "POST" | "DELETE", studentId = "s1") =>
  method === "POST"
    ? callHandler(handler, studentId ? { studentId } : {}, "POST")
    : callHandler(handler, undefined, "DELETE", studentId ? { studentId } : {});

const ENROLLMENTS = [
  {
    tenant_id: "tenant-1",
    student_id: "s1",
    school_year: 2026,
    status: "active",
    class_id: "c-A",
  },
  {
    tenant_id: "tenant-1",
    student_id: "s2",
    school_year: 2026,
    status: "active",
    class_id: "c-B",
  },
  {
    tenant_id: "tenant-2",
    student_id: "s3",
    school_year: 2026,
    status: "active",
    class_id: "c-X",
  },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({
    kind: "homeroom",
    class_ids: ["c-A"],
    teacher_id: "teacher-1",
  });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) => matchRows(ENROLLMENTS, f);
});

describe("POST /api/console/students/flag", () => {
  test("a homeroom flags a student of own class and the flag and an audit record are written", async () => {
    const r = await call("POST");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, flagged: true });
    expect(kit.state.upserts).toEqual([
      {
        table: "student_flags",
        row: {
          student_id: "s1",
          tenant_id: "tenant-1",
          flagged_teacher_id: "teacher-1",
        },
        onConflict: "tenant_id,student_id",
      },
    ]);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        action: "update",
        resource_key: "studentFlag",
        target_id: "s1",
        meta: { flagged: true },
      },
    });
  });

  test("a duplicate error is never swallowed because the key holds the tenant and a clash would hide another tenant's row", async () => {
    kit.state.insertErrors.student_flags = { code: "23505" };

    expect((await call("POST")).status).toBe(500);
  });

  test("a student who left the current school year is 404", async () => {
    kit.state.rows.student_enrollments = (f) =>
      matchRows([{ ...ENROLLMENTS[0], status: "graduated" }], f);

    expect((await call("POST")).status).toBe(404);
    expect(kit.state.upserts).toEqual([]);
  });

  test("a student of another class, another tenant or nobody is 404 and writes nothing", async () => {
    expect((await call("POST", "s2")).status).toBe(404);
    expect((await call("POST", "s3")).status).toBe(404);
    expect((await call("POST", "nobody")).status).toBe(404);
    expect(kit.state.upserts).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a school admin flags any student of the tenant, a missing id is 400", async () => {
    kit.state.actor = schoolAdminActor();

    expect((await call("POST", "s2")).status).toBe(200);
    expect((await call("POST", "")).status).toBe(400);
  });

  test("a failing audit write fails the request", async () => {
    kit.state.insertErrors.admin_access_logs = { message: "down" };

    expect((await call("POST")).status).toBe(500);
  });

  test("a database failure other than a duplicate is a 500", async () => {
    kit.state.insertErrors.student_flags = { code: "XX000" };

    expect((await call("POST")).status).toBe(500);
  });
});

describe("DELETE /api/console/students/flag", () => {
  test("removes the flag of a student in scope scoped to the tenant and audits it", async () => {
    const r = await call("DELETE");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, flagged: false });
    expect(kit.state.deletes).toEqual([
      {
        table: "student_flags",
        filters: { tenant_id: "tenant-1", student_id: "s1" },
      },
    ]);
    expect(kit.state.inserts[0]).toMatchObject({
      row: { resource_key: "studentFlag", meta: { flagged: false } },
    });
  });

  test("a student out of scope is 404 and nothing is deleted", async () => {
    expect((await call("DELETE", "s2")).status).toBe(404);
    expect(kit.state.deletes).toEqual([]);
  });
});
