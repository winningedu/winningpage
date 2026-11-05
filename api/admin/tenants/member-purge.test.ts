// POST /api/admin/tenants/member-purge 계약 검증(사 #162, #176). 본사 tenants edit 권한만, 기관 하나만,
// 유예가 끝났을 때만 익명화하고 로그의 실행자는 그 본사 관리자다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./member-purge.js";

const post = (body: unknown, method = "POST") =>
  callHandler(handler, body, method);

const anonymizeArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "edit" }],
    error: null,
  });
  anonymizeArgs.length = 0;
  kit.state.rpc.fn_anonymize_expired_b2b_members = (args) => {
    anonymizeArgs.push(args);
    return {
      data: [
        {
          tenants_processed: 1,
          members_anonymized: 3,
          members_protected: 1,
          grace_end: "2026-10-01",
          not_yet: false,
        },
      ],
      error: null,
    };
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/tenants/member-purge", () => {
  test.each([
    ["권한 없음", []],
    ["tenants view 만", [{ resource_key: "tenants", level: "view" }]],
    ["다른 리소스 edit", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 아무것도 지우지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await post({ tenantId: "tenant-7" });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("유예가 끝나지 않았으면 409 NOT_YET 과 유예 종료일을 돌려준다", async () => {
    kit.state.rpc.fn_anonymize_expired_b2b_members = () => ({
      data: [
        {
          tenants_processed: 0,
          members_anonymized: 0,
          members_protected: 0,
          grace_end: "2026-12-01",
          not_yet: true,
        },
      ],
      error: null,
    });

    const r = await post({ tenantId: "tenant-7" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      error: { code: "NOT_YET" },
      graceEndsOn: "2026-12-01",
    });
  });

  test("성공하면 그 기관만, 로그 실행자를 본사 관리자로 해서 익명화하고 건수를 돌려준다", async () => {
    const r = await post({ tenantId: "tenant-7" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deleted: 3, excluded: 1 });
    expect(anonymizeArgs).toEqual([
      {
        p_tenant: "tenant-7",
        p_actor_profile: "hq-1",
        p_actor_email: "hq@example.com",
      },
    ]);
  });

  test.each([
    ["tenantId 없음", {}],
    ["빈 tenantId", { tenantId: "" }],
    ["문자열이 아닌 tenantId", { tenantId: 7 }],
    ["본문 없음", undefined],
  ])("%s 이면 400 이고 아무것도 지우지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("POST 이외의 메서드는 405 이다", async () => {
    const r = await post({ tenantId: "tenant-7" }, "GET");

    expect(r.status).toBe(405);
    expect(anonymizeArgs).toHaveLength(0);
  });

  test("DB 함수가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rpc.fn_anonymize_expired_b2b_members = () => ({
      data: null,
      error: { code: "XX000" },
    });

    const r = await post({ tenantId: "tenant-7" });

    expect(r.status).toBe(500);
  });
});
