// GET /api/admin/tenants/purge-logs 계약 검증(사 #163, #177). 본사 권한 tenants view 이상만 읽고,
// 이름과 연락처 없이 실행 일시, 실행자, 기관, 계약 종료일, 삭제 건수, 제외 건수, 회원번호 목록만 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./purge-logs.js";

const get = (query: Record<string, string> = {}, method = "GET") =>
  callHandler(handler, undefined, method, query);

const LOG_ROW = {
  id: "log-1",
  created_at: "2026-11-05T19:40:00Z",
  actor_login_id: "system:b2b-retention-purge",
  actor_email: null,
  tenant_id: "tenant-7",
  row_count: 2,
  meta: {
    contract_end_date: "2026-09-01",
    grace_ends_on: "2026-10-01",
    deleted_count: 2,
    excluded_count: 1,
    member_ids: ["m-1", "m-2"],
  },
  tenants: { code: "ABCD1234", name: "한빛고" },
};

const filtersSeen: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "view" }],
    error: null,
  });
  filtersSeen.length = 0;
  kit.state.rows.admin_access_logs = (filters) => {
    filtersSeen.push({ ...filters });
    return [LOG_ROW];
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/purge-logs", () => {
  test.each([
    ["권한 없음", []],
    ["tenants none", [{ resource_key: "tenants", level: "none" }]],
    ["다른 리소스 edit", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 로그를 읽지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(filtersSeen).toHaveLength(0);
  });

  test("tenants view 권한이면 삭제 로그를 항목별로 돌려준다(개인정보 없음)", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      logs: [
        {
          id: "log-1",
          executedAt: "2026-11-05T19:40:00Z",
          executedBy: "system:b2b-retention-purge",
          tenant: { id: "tenant-7", code: "ABCD1234", name: "한빛고" },
          contractEndDate: "2026-09-01",
          deletedCount: 2,
          excludedCount: 1,
          skippedCount: 0,
          memberIds: ["m-1", "m-2"],
        },
      ],
    });
    expect(filtersSeen[0]).toMatchObject({ action: "member_purge" });
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });

  test("본사가 실행한 삭제는 로그인 아이디가 없어 실행자를 이메일로 보여 준다", async () => {
    kit.state.rows.admin_access_logs = () => [
      { ...LOG_ROW, actor_login_id: null, actor_email: "hq@example.com" },
    ];

    const r = await get();

    expect(r.status).toBe(200);
    expect(
      (r.body as { logs: { executedBy: string | null }[] }).logs[0]?.executedBy,
    ).toBe("hq@example.com");
  });

  test("직접 제외한 건수는 meta.skipped_count 에서 읽는다", async () => {
    kit.state.rows.admin_access_logs = () => [
      { ...LOG_ROW, meta: { ...LOG_ROW.meta, skipped_count: 3 } },
    ];

    const r = await get();

    expect(
      (r.body as { logs: { skippedCount: number }[] }).logs[0]?.skippedCount,
    ).toBe(3);
  });

  test("tenants edit 권한도 읽을 수 있다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "tenants", level: "edit" }],
      error: null,
    });

    const r = await get();

    expect(r.status).toBe(200);
  });

  test("tenantId 를 주면 그 기관의 로그만 읽는다", async () => {
    await get({ tenantId: "tenant-7" });

    expect(filtersSeen[0]).toMatchObject({
      action: "member_purge",
      tenant_id: "tenant-7",
    });
  });

  test("GET 이외의 메서드는 405 이다", async () => {
    const r = await get({}, "POST");

    expect(r.status).toBe(405);
    expect(filtersSeen).toHaveLength(0);
  });
});
