// POST /api/console/memos/hide 계약 검증(W9d 메모 삭제). 작성자만 화면에서 숨기고 작성자와 시각은 남는다.

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

import handler from "./hide.js";

const post = (body: unknown) => callHandler(handler, body, "POST");

const row = (over: Record<string, unknown>) => ({
  id: "m1",
  tenant_id: "tenant-1",
  student_id: "s1",
  author_teacher_id: "t-home",
  hidden_at: null,
  ...over,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor({
    kind: "homeroom",
    class_ids: ["c-A"],
    teacher_id: "t-home",
  });
  kit.state.rows.teacher_memos = (f) =>
    matchRows(
      [
        row({}),
        row({ id: "m2", author_teacher_id: "t-admin" }),
        row({ id: "m3", hidden_at: "2026-10-30T00:00:00Z" }),
        row({ id: "m9", tenant_id: "tenant-2" }),
      ],
      f,
    );
});

describe("POST /api/console/memos/hide", () => {
  test("the author hides the memo: hidden_at is set, nothing is deleted, one audit record", async () => {
    const r = await post({ memoId: "m1" });

    expect(r.status).toBe(200);
    expect(kit.state.updates).toHaveLength(1);
    expect(kit.state.updates[0]).toMatchObject({
      table: "teacher_memos",
      filters: { id: "m1", author_teacher_id: "t-home" },
    });
    expect(kit.state.updates[0]?.values.hidden_at).toEqual(expect.any(String));
    expect(
      kit.state.inserts.filter((i) => i.table === "admin_access_logs")[0]?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "teacherMemo",
      target_id: "m1",
    });
  });

  test("another teacher's memo is 403 and stays as it is", async () => {
    expect((await post({ memoId: "m2" })).status).toBe(403);
    expect(kit.state.updates).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("an unknown memo and a memo of another tenant are 404", async () => {
    expect((await post({ memoId: "nope" })).status).toBe(404);
    expect((await post({ memoId: "m9" })).status).toBe(404);
    expect(kit.state.updates).toEqual([]);
  });

  test("hiding a memo that is already hidden is a no-op success", async () => {
    const r = await post({ memoId: "m3" });
    expect(r.status).toBe(200);
    expect(kit.state.updates).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("a bad body is 400 and a proxy session is 403", async () => {
    expect((await post({})).status).toBe(400);
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "ps1",
    });
    expect((await post({ memoId: "m1" })).status).toBe(403);
  });
});
