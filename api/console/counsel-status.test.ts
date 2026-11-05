// PUT /api/console/counsel-status 계약 검증(W10 상담 상태, 교 #51, 결정 2). 상태는 절대값으로 정한다.

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

import handler from "./counsel-status.js";

const put = (body: unknown) => callHandler(handler, body, "PUT");

const enrollment = (student_id: string, class_id: string, grade: string) => ({
  tenant_id: "tenant-1",
  student_id,
  school_year: 2026,
  status: "active",
  grade,
  class_id,
  number: 1,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({
    kind: "homeroom",
    class_ids: ["c-3"],
    teacher_id: "teacher-1",
  });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment("s1", "c-3", "고3"),
        enrollment("s2", "c-4", "고3"),
        enrollment("s3", "c-3", "고2"),
        { ...enrollment("s4", "c-x", "고3"), tenant_id: "tenant-2" },
      ],
      f,
    );
  const cls = (id: string, grade: string) => ({
    id,
    tenant_id: "tenant-1",
    school_year: 2026,
    grade,
    group_id: null,
    name: id,
  });
  kit.state.rows.classes = (f) =>
    matchRows([cls("c-3", "고3"), cls("c-4", "고3"), cls("c-x", "고3")], f);
  kit.state.rows.class_groups = () => [];
  kit.state.rows.counsel_statuses = () => [];
});

describe("PUT /api/console/counsel-status", () => {
  test("a homeroom sets the status of a grade-3 student of own class, the row and an audit record are written", async () => {
    const r = await put({ studentId: "s1", status: "scheduled" });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: "scheduled" });
    expect(kit.state.upserts).toEqual([
      {
        table: "counsel_statuses",
        row: expect.objectContaining({
          student_id: "s1",
          tenant_id: "tenant-1",
          status: "scheduled",
          changed_by: "teacher-1",
        }),
        onConflict: "student_id",
      },
    ]);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        action: "update",
        resource_key: "counselStatus",
        target_id: "s1",
        meta: { from: "unset", to: "scheduled" },
      },
    });
  });

  test("sending the same status again writes no row, keeps the change date and leaves an unchanged audit record", async () => {
    kit.state.rows.counsel_statuses = () => [
      { status: "done", changed_at: "2026-11-01T00:00:00Z" },
    ];

    const r = await put({ studentId: "s1", status: "done" });

    expect(r.body).toEqual({
      ok: true,
      status: "done",
      changedAt: "2026-11-01T00:00:00Z",
    });
    expect(kit.state.upserts).toEqual([]);
    expect(kit.state.inserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      row: { meta: { from: "done", to: "done", unchanged: true } },
    });
  });

  test("setting unset on a student who never had a status writes no row", async () => {
    const r = await put({ studentId: "s1", status: "unset" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, status: "unset", changedAt: null });
    expect(kit.state.upserts).toEqual([]);
  });

  test("changing from another status records the previous one in the audit meta", async () => {
    kit.state.rows.counsel_statuses = () => [
      { status: "scheduled", changed_at: "2026-11-01T00:00:00Z" },
    ];

    const r = await put({ studentId: "s1", status: "needed" });

    expect(r.status).toBe(200);
    expect(kit.state.upserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      row: { meta: { from: "scheduled", to: "needed" } },
    });
  });

  test("a student of another class, another tenant, not in grade 3 or nobody is 404 and writes nothing", async () => {
    for (const studentId of ["s2", "s3", "s4", "nobody"]) {
      expect((await put({ studentId, status: "done" })).status).toBe(404);
    }
    expect(kit.state.upserts).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a school admin sets any grade-3 student of the tenant", async () => {
    kit.state.actor = schoolAdminActor();

    expect((await put({ studentId: "s2", status: "done" })).status).toBe(200);
  });

  test("an unknown status or a missing student id is 400", async () => {
    expect((await put({ studentId: "s1", status: "later" })).status).toBe(400);
    expect((await put({ studentId: "s1" })).status).toBe(400);
    expect((await put({ status: "done" })).status).toBe(400);
    expect((await put({ studentId: "", status: "done" })).status).toBe(400);
  });

  test("a failing audit write or database write fails the request", async () => {
    kit.state.insertErrors.admin_access_logs = { message: "down" };
    expect((await put({ studentId: "s1", status: "done" })).status).toBe(500);

    kit.state.insertErrors = { counsel_statuses: { message: "down" } };
    expect((await put({ studentId: "s1", status: "done" })).status).toBe(500);
  });

  test("other methods are refused", async () => {
    expect((await callHandler(handler, {}, "POST")).status).toBe(405);
  });
});
