// GET /api/admin/access-logs 계약 검증(사 #170, 교 #66, 결정 102.5). 최고 관리자만 읽고,
// 교사 이름, 로그인 아이디, 가린 전화번호, 가린 학생 이름을 붙여 한 줄씩 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./access-logs.js";

const get = (query: Record<string, string> = {}, method = "GET") =>
  callHandler(handler, undefined, method, query);

interface Body {
  logs: Record<string, unknown>[];
  page: number;
  hasNext: boolean;
}

const TEACHER_VIEW_LOG = {
  id: "log-1",
  created_at: "2026-11-05T10:00:00Z",
  action: "view",
  resource_key: "studentDetail",
  reason: null,
  row_count: null,
  target_id: "stu-1",
  actor_email: null,
  actor_kind: "teacher",
  actor_login_id: "ABCD1234a1b2c3",
  profile_id: null,
  teacher_id: "tch-1",
  proxy_session_id: null,
  meta: {},
  tenants: { code: "ABCD1234" },
};

const TEACHERS = [
  {
    id: "tch-1",
    name: "박교사",
    phone: "01012341234",
    login_id: "ABCD1234a1b2c3",
  },
];

const PROFILES = [
  { id: "stu-1", name: "김하늘", member_type: "student" },
  { id: "hq-1", name: "본사직원", member_type: "admin" },
];

const logFilters: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
  logFilters.length = 0;
  kit.state.rows.admin_access_logs = (filters) => {
    logFilters.push({ ...filters });
    return [TEACHER_VIEW_LOG];
  };
  kit.state.rows.teachers = (filters) => matchRows(TEACHERS, filters);
  kit.state.rows.profiles = (filters) => matchRows(PROFILES, filters);
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

  test("교사 이름, 로그인 아이디, 가린 전화번호와 가린 학생 이름을 한 줄로 붙인다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as Body;
    expect(body.logs).toEqual([
      expect.objectContaining({
        id: "log-1",
        createdAt: "2026-11-05T10:00:00Z",
        tenantCode: "ABCD1234",
        teacherName: "박교사",
        teacherLoginId: "ABCD1234a1b2c3",
        teacherPhone: "010-****-1234",
        kind: "view",
        kindLabel: "조회",
        targetStudentName: "김*늘",
        content: "학생 상세",
        isProxy: false,
      }),
    ]);
    expect(JSON.stringify(r.body)).not.toContain("김하늘");
    expect(JSON.stringify(r.body)).not.toContain("01012341234");
  });
});
