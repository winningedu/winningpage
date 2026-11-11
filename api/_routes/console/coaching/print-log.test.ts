// POST /api/console/coaching/print-log 계약 검증(교 #234). 코칭 PDF 를 열 때 접근 로그를 남긴다.

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

import handler from "./print-log.js";

const post = (body: unknown) => callHandler(handler, body, "POST");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({
    kind: "homeroom",
    class_ids: ["c-A"],
    teacher_id: "t-home",
  });
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        {
          tenant_id: "tenant-1",
          school_year: 2026,
          status: "active",
          student_id: "s1",
          grade: "고2",
          class_id: "c-A",
          number: 1,
        },
        {
          tenant_id: "tenant-1",
          school_year: 2026,
          status: "active",
          student_id: "s2",
          grade: "고2",
          class_id: "c-B",
          number: 2,
        },
      ],
      f,
    );
});

describe("POST /api/console/coaching/print-log", () => {
  test("writes one export audit record for the student", async () => {
    const r = await post({ studentId: "s1" });
    expect(r.status).toBe(200);
    const logs = kit.state.inserts.filter(
      (i) => i.table === "admin_access_logs",
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.row).toMatchObject({
      action: "export",
      resource_key: "coachingPdf",
      target_id: "s1",
      tenant_id: "tenant-1",
      teacher_id: "t-home",
    });
  });

  test("a school admin may print any student of the tenant", async () => {
    kit.state.actor = schoolAdminActor();
    expect((await post({ studentId: "s2" })).status).toBe(200);
  });

  test("a student out of scope is 404 and leaves no record", async () => {
    expect((await post({ studentId: "s2" })).status).toBe(404);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a missing studentId is 400", async () => {
    expect((await post({})).status).toBe(400);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a failed audit write is a 500, so a print is never unrecorded", async () => {
    kit.state.insertErrors.admin_access_logs = { code: "XX000" };
    expect((await post({ studentId: "s1" })).status).toBe(500);
  });
});
