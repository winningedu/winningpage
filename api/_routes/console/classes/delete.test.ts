// POST /api/console/classes/delete 계약 검증(QA 51, 빈 반 삭제). 학교 관리자와 본사 대행만.
// 검사와 삭제는 fn_class_delete 한 문장이라, 그 사이에 학생이 들어와도 비어 있지 않은 반은 지워지지 않는다.

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

import handler from "./delete.js";

const post = (body: unknown) => callHandler(handler, body, "POST");

const CLASSES = [
  { id: "c-1", tenant_id: "tenant-1", grade: "중3", name: "1반" },
  { id: "c-x", tenant_id: "tenant-2", grade: "중3", name: "1반" },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  kit.state.rows.classes = (f) => matchRows(CLASSES, f)[0] ?? null;
  // 비어 있는 반만 지운다: 실제 DB 의 NOT EXISTS 조건을 흉내 낸다.
  kit.state.rpc.fn_class_delete = (args) => ({
    data: CLASSES.filter(
      (c) => c.id === args.p_class_id && c.tenant_id === args.p_tenant,
    ),
    error: null,
  });
});

const audits = () =>
  kit.state.inserts.filter((i) => i.table === "admin_access_logs");

describe("POST /api/console/classes/delete", () => {
  test("deletes an empty class in one rpc call and records an audit entry with its id, grade and name", async () => {
    const res = await post({ classId: "c-1" });

    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(kit.state.events.filter((e) => e === "rpc:fn_class_delete")).toEqual(
      ["rpc:fn_class_delete"],
    );
    expect(audits().map((a) => a.row)).toEqual([
      expect.objectContaining({
        action: "update",
        resource_key: "classDelete",
        target_id: "c-1",
        tenant_id: "tenant-1",
        meta: { classId: "c-1", grade: "중3", name: "1반" },
      }),
    ]);
  });

  test("a class that still has students, pending roster rows or teachers is 409 CLASS_NOT_EMPTY and nothing is audited", async () => {
    kit.state.rpc.fn_class_delete = () => ({ data: [], error: null });

    const res = await post({ classId: "c-1" });

    expect(res).toMatchObject({
      status: 409,
      body: { error: { code: "CLASS_NOT_EMPTY" } },
    });
    expect(audits()).toEqual([]);
  });

  test("an unknown class, another tenant's class, or a retry after success is 404 CLASS_NOT_FOUND", async () => {
    kit.state.rpc.fn_class_delete = () => ({ data: [], error: null });

    for (const classId of ["ghost", "c-x"]) {
      expect(await post({ classId })).toMatchObject({
        status: 404,
        body: { error: { code: "CLASS_NOT_FOUND" } },
      });
    }
    expect(audits()).toEqual([]);
  });

  test("the rpc is scoped to the actor's tenant", async () => {
    const spy = vi.fn(() => ({ data: [], error: null }));
    kit.state.rpc.fn_class_delete = spy;

    await post({ classId: "c-x" });

    expect(spy).toHaveBeenCalledWith({
      p_class_id: "c-x",
      p_tenant: "tenant-1",
    });
  });

  test("an HQ proxy session may delete", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      proxy_session_id: "proxy-1",
    });

    expect((await post({ classId: "c-1" })).status).toBe(200);
  });

  test("a homeroom teacher is refused (403) and the rpc is not called", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-1"],
    });

    expect((await post({ classId: "c-1" })).status).toBe(403);
    expect(kit.state.events).not.toContain("rpc:fn_class_delete");
  });

  test("rejects a missing or non-string classId with 400", async () => {
    for (const body of [{}, { classId: "" }, { classId: 3 }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(kit.state.events).not.toContain("rpc:fn_class_delete");
  });

  test("when the rpc fails the error is 500 and nothing is audited", async () => {
    kit.state.rpc.fn_class_delete = () => ({
      data: null,
      error: { message: "down" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await post({ classId: "c-1" })).status).toBe(500);
    expect(audits()).toEqual([]);
  });
});
