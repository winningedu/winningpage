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
    matchRows(
      [cls("c-3", "고3"), cls("c-4", "고3"), cls("c-x", "고3")],
      f,
    );
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
});
