// POST /api/console/assign-pool/confirm 계약 검증. 확인 필요 학생을 확인하면 미배정 목록에서 빠진다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  schoolAdminActor,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./confirm.js";

const post = (body: unknown) => callHandler(handler, body, "POST");
const confirmArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = schoolAdminActor();
  confirmArgs.length = 0;
  kit.state.rpc.fn_enrollment_confirm = (args) => {
    confirmArgs.push(args);
    return {
      data: [{ enrollment_id: "enr-1", version: 3, changed: true }],
      error: null,
    };
  };
});

const audits = () =>
  kit.state.inserts.filter((i) => i.table === "admin_access_logs");

describe("POST /api/console/assign-pool/confirm", () => {
  test("a school admin confirms any class in the tenant, with the version and an audit row", async () => {
    const r = await post({ studentId: "s1", expectedVersion: 2 });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ version: 3, changed: true });
    expect(confirmArgs).toEqual([
      {
        p_student: "s1",
        p_expected_version: 2,
        p_actor: "profile-1",
        p_tenant: "tenant-1",
        p_allowed_class_ids: null,
      },
    ]);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]?.row).toMatchObject({
      action: "update",
      resource_key: "studentEnrollment",
      target_id: "s1",
    });
  });

  test("a homeroom teacher passes own classes so the RPC limits the scope", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "homeroom",
      class_ids: ["c-A"],
    });
    await post({ studentId: "s1", expectedVersion: 2 });
    expect(confirmArgs[0]?.p_allowed_class_ids).toEqual(["c-A"]);
  });

  test("an already confirmed student is a no-op success without an audit row", async () => {
    kit.state.rpc.fn_enrollment_confirm = () => ({
      data: [{ enrollment_id: "enr-1", version: 5, changed: false }],
      error: null,
    });
    const r = await post({ studentId: "s1", expectedVersion: 2 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ version: 5, changed: false });
    expect(audits()).toHaveLength(0);
  });

  test.each([
    ["WC078", 409, "VERSION_CONFLICT"],
    ["WC081", 404, "NOT_FOUND"],
  ])("RPC %s maps to %i %s", async (code, status, errorCode) => {
    kit.state.rpc.fn_enrollment_confirm = () => ({
      data: null,
      error: { code, message: "x" },
    });
    const r = await post({ studentId: "s1", expectedVersion: 2 });
    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ status, code: errorCode });
    expect(audits()).toHaveLength(0);
  });

  test.each([
    [{}],
    [{ studentId: "", expectedVersion: 1 }],
    [{ studentId: "s1" }],
    [{ studentId: "s1", expectedVersion: "2" }],
  ])("a malformed body %j is a 400", async (body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(confirmArgs).toEqual([]);
  });

  test("a read-only proxy cannot confirm", async () => {
    kit.state.actor = schoolAdminActor({
      kind: "hq_proxy",
      proxy_session_id: "proxy-1",
    });
    kit.state.rows.proxy_sessions = () => ({ reason: "read_only" });
    const r = await post({ studentId: "s1", expectedVersion: 2 });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "READ_ONLY_PROXY" });
    expect(confirmArgs).toEqual([]);
  });
});
