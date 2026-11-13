// GET /api/console/classes 계약 검증(W13 필터, W13b 선택지, 담임 없는 반 안내). 담임은 담당 학급만 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./classes.js";

const get = (query: Record<string, string> = {}) =>
  callHandler(handler, undefined, "GET", query);

const CLASSES = [
  {
    id: "c-b",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "10",
  },
  {
    id: "c-a",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고2",
    group_id: null,
    name: "3",
  },
  {
    id: "c-g",
    tenant_id: "tenant-1",
    school_year: 2026,
    grade: "고1",
    group_id: "g-1",
    name: "1",
  },
  {
    id: "c-old",
    tenant_id: "tenant-1",
    school_year: 2025,
    grade: "고1",
    group_id: null,
    name: "2",
  },
  {
    id: "c-x",
    tenant_id: "tenant-2",
    school_year: 2026,
    grade: "고1",
    group_id: null,
    name: "9",
  },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학원" });
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
  kit.state.rows.class_groups = (f) =>
    matchRows([{ id: "g-1", tenant_id: "tenant-1", name: "A레벨" }], f);
  kit.state.rows.teacher_class_assignments = (f) =>
    matchRows([{ tenant_id: "tenant-1", class_id: "c-a" }], f);
});

describe("GET /api/console/classes", () => {
  test("school admin gets this year's classes of the tenant with group names and the homeroom flag, ordered by grade, group, class number", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      classes: [
        {
          id: "c-g",
          grade: "고1",
          groupId: "g-1",
          groupName: "A레벨",
          name: "1",
          hasHomeroom: false,
        },
        {
          id: "c-a",
          grade: "고2",
          groupId: null,
          groupName: null,
          name: "3",
          hasHomeroom: true,
        },
        {
          id: "c-b",
          grade: "고2",
          groupId: null,
          groupName: null,
          name: "10",
          hasHomeroom: false,
        },
      ],
    });
  });

  test("a mixed-grade class comes with a null grade after the graded classes, and a homeroom of it sees it", async () => {
    const mixed = {
      id: "c-m",
      tenant_id: "tenant-1",
      school_year: 2026,
      grade: null,
      group_id: null,
      name: "다",
    };
    kit.state.rows.classes = (f) => matchRows([...CLASSES, mixed], f);

    const all = (await get()).body as {
      classes: { id: string; grade: string | null }[];
    };
    expect(all.classes.map((c) => c.id)).toEqual(["c-g", "c-a", "c-b", "c-m"]);
    expect(all.classes[3]).toMatchObject({ grade: null });

    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-m"],
    });
    const own = (await get()).body as { classes: { id: string }[] };
    expect(own.classes.map((c) => c.id)).toEqual(["c-m"]);
  });

  test("every full read is ordered by a column its table has (assignments have no id column)", async () => {
    await get();
    expect(kit.state.orders).toContainEqual({
      table: "teacher_class_assignments",
      column: "class_id",
    });
  });

  test("year selects another school year", async () => {
    const r = await get({ year: "2025" });
    expect(
      (r.body as { classes: { id: string }[] }).classes.map((c) => c.id),
    ).toEqual(["c-old"]);
  });

  test("a homeroom sees only the classes assigned to them", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-b"],
    });
    const r = await get();
    expect(
      (r.body as { classes: { id: string }[] }).classes.map((c) => c.id),
    ).toEqual(["c-b"]);
  });

  test("a malformed year is a 400", async () => {
    expect((await get({ year: "next" })).status).toBe(400);
  });
});
