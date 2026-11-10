// PATCH /api/console/classes/capacity 계약 검증(W7 정원 입력, 사 #150). 학교 관리자 전용, 값은 절대값이라 다시 보내도 같다.

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

import handler from "./capacity.js";

const patch = (body: unknown) => callHandler(handler, body, "PATCH");

const CLASSES = [
  { id: "c-1", tenant_id: "tenant-1", school_year: 2026, capacity: 30 },
  { id: "c-2", tenant_id: "tenant-1", school_year: 2026, capacity: null },
  { id: "c-old", tenant_id: "tenant-1", school_year: 2025, capacity: null },
  { id: "c-x", tenant_id: "tenant-2", school_year: 2026, capacity: null },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.tenants = () => ({ school_year: 2026, org_type: "학교" });
  kit.state.rows.classes = (f) => matchRows(CLASSES, f);
});

const capacityUpdates = () =>
  kit.state.updates.filter((u) => u.table === "classes");

describe("PATCH /api/console/classes/capacity", () => {
  test("sets the capacity of this year's classes, clears it with null, and records an audit entry", async () => {
    const res = await patch({
      items: [
        { classId: "c-1", capacity: null },
        { classId: "c-2", capacity: 32 },
      ],
    });

    expect(res).toMatchObject({ status: 200, body: { ok: true, updated: 2 } });
    expect(capacityUpdates()).toEqual([
      {
        table: "classes",
        values: { capacity: null },
        filters: { id: "c-1", tenant_id: "tenant-1" },
      },
      {
        table: "classes",
        values: { capacity: 32 },
        filters: { id: "c-2", tenant_id: "tenant-1" },
      },
    ]);
    expect(
      kit.state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "classCapacity",
      row_count: 2,
      tenant_id: "tenant-1",
    });
  });

  test("when an update fails partway, the classes already saved are audited and then the error is returned (decision 67)", async () => {
    kit.state.updateErrors.classes = (f) =>
      f.id === "c-2" ? { message: "down" } : undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await patch({
      items: [
        { classId: "c-1", capacity: null },
        { classId: "c-2", capacity: 32 },
      ],
    });

    expect(res.status).toBe(500);
    expect(capacityUpdates().map((u) => u.filters.id)).toEqual(["c-1", "c-2"]);
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs"),
    ).toEqual([
      {
        table: "admin_access_logs",
        row: expect.objectContaining({
          action: "update",
          resource_key: "classCapacity",
          row_count: 1,
          meta: { items: [{ classId: "c-1", capacity: null }] },
        }),
      },
    ]);
  });

  test("when the first update fails nothing was saved, so no audit record is written", async () => {
    kit.state.updateErrors.classes = () => ({ message: "down" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await patch({ items: [{ classId: "c-1", capacity: null }] });

    expect(res.status).toBe(500);
    expect(kit.state.inserts).toEqual([]);
  });

  test("replaying the same values writes nothing and logs nothing", async () => {
    const res = await patch({ items: [{ classId: "c-1", capacity: 30 }] });

    expect(res).toMatchObject({ status: 200, body: { ok: true, updated: 0 } });
    expect(capacityUpdates()).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a class of another tenant or an earlier school year is 404 and nothing is written", async () => {
    for (const classId of ["c-x", "c-old", "ghost"]) {
      const res = await patch({
        items: [
          { classId: "c-2", capacity: 10 },
          { classId, capacity: 10 },
        ],
      });
      expect(res.status).toBe(404);
    }
    expect(capacityUpdates()).toEqual([]);
  });

  test("rejects bad input with 400: empty list, duplicate class, zero, fraction, non-number", async () => {
    const bad = [
      { items: [] },
      {
        items: [
          { classId: "c-1", capacity: 5 },
          { classId: "c-1", capacity: 6 },
        ],
      },
      { items: [{ classId: "c-1", capacity: 0 }] },
      { items: [{ classId: "c-1", capacity: 1.5 }] },
      { items: [{ classId: "c-1", capacity: "30" }] },
      { items: [{ capacity: 30 }] },
      {},
    ];
    for (const body of bad) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(capacityUpdates()).toEqual([]);
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-1"],
    });

    expect(
      (await patch({ items: [{ classId: "c-1", capacity: 5 }] })).status,
    ).toBe(403);
  });
});
