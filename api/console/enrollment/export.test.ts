// POST /api/console/enrollment/export 계약 검증(W7 엑셀 출력 기록, 교 #227). 파일은 브라우저가 만들고 서버는 출력 사실만 남긴다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  schoolAdminActor,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./export.js";

const post = (body: unknown) => callHandler(handler, body, "POST");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
});

describe("POST /api/console/enrollment/export", () => {
  test("records an export access log with the class count", async () => {
    const res = await post({ classCount: 15 });

    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(
      kit.state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "export",
      resource_key: "enrollment",
      row_count: 15,
      tenant_id: "tenant-1",
    });
  });

  test("rejects a missing or negative class count with 400", async () => {
    for (const body of [{}, { classCount: -1 }, { classCount: "3" }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(kit.state.inserts).toEqual([]);
  });

  test("a homeroom teacher is refused (403)", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-1"],
    });

    expect((await post({ classCount: 1 })).status).toBe(403);
  });
});
