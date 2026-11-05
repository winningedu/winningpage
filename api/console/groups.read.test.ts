// GET /api/console/groups 계약 검증(W11 그룹 관리 목록). 재학생 수는 fn_group_soft_delete 와 같은 규칙으로 센다.

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

import handler from "./groups.js";

const get = () => callHandler(handler, undefined, "GET");

const enrollment = (
  classId: string | null,
  over: Record<string, unknown> = {},
) => ({
  tenant_id: "tenant-1",
  school_year: 2026,
  status: "active",
  class_id: classId,
  ...over,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
  kit.state.rows.class_groups = (f) =>
    matchRows(
      [
        { id: "g-b", tenant_id: "tenant-1", name: "B레벨", deleted_at: null },
        { id: "g-a", tenant_id: "tenant-1", name: "A레벨", deleted_at: null },
        {
          id: "g-del",
          tenant_id: "tenant-1",
          name: "지운",
          deleted_at: "2026-01-01",
        },
        { id: "g-x", tenant_id: "tenant-2", name: "남의", deleted_at: null },
      ],
      f,
    );
  kit.state.rows.classes = (f) =>
    matchRows(
      [
        {
          id: "c-a1",
          tenant_id: "tenant-1",
          school_year: 2026,
          group_id: "g-a",
        },
        {
          id: "c-a2",
          tenant_id: "tenant-1",
          school_year: 2026,
          group_id: "g-a",
        },
        {
          id: "c-old",
          tenant_id: "tenant-1",
          school_year: 2025,
          group_id: "g-b",
        },
        {
          id: "c-none",
          tenant_id: "tenant-1",
          school_year: 2026,
          group_id: null,
        },
      ],
      f,
    );
  kit.state.rows.student_enrollments = (f) =>
    matchRows(
      [
        enrollment("c-a1"),
        enrollment("c-a1"),
        enrollment("c-a2"),
        enrollment("c-a2", { status: "graduated" }),
        enrollment("c-old", { school_year: 2025 }),
        enrollment("c-none"),
        enrollment(null),
      ],
      f,
    );
});

describe("GET /api/console/groups", () => {
  test("lists the tenant's live groups by name with the active students in this year's classes", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      groups: [
        { id: "g-a", name: "A레벨", studentCount: 3 },
        { id: "g-b", name: "B레벨", studentCount: 0 },
      ],
    });
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-a1"],
    });
    expect((await get()).status).toBe(403);
  });
});
