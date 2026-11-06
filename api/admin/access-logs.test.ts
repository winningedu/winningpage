// GET /api/admin/access-logs 계약 검증(사 #170, 교 #66, 결정 102.5). 최고 관리자만 읽고,
// 교사 이름, 로그인 아이디, 가린 전화번호, 가린 학생 이름을 붙여 한 줄씩 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./access-logs.js";

const get = (query: Record<string, string> = {}, method = "GET") =>
  callHandler(handler, undefined, method, query);

const logFilters: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
  logFilters.length = 0;
  kit.state.rows.admin_access_logs = (filters) => {
    logFilters.push({ ...filters });
    return [];
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/access-logs", () => {
  test("최고 관리자가 아니면 403 이고 로그를 읽지 않는다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({ data: false, error: null });

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(logFilters).toHaveLength(0);
  });
});
