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

  test("위닝 관리자 행은 관리자 이름, 계정, 사유를 그대로 두고 학생이 아닌 대상은 이름이 없다", async () => {
    kit.state.rows.admin_access_logs = () => [
      {
        ...TEACHER_VIEW_LOG,
        id: "log-2",
        action: "unmask",
        resource_key: "members",
        reason: "고객 문의 확인",
        target_id: "hq-1",
        actor_email: "hq@example.com",
        actor_kind: null,
        actor_login_id: null,
        profile_id: "hq-1",
        teacher_id: null,
        tenants: null,
      },
    ];

    const r = await get();

    expect((r.body as Body).logs[0]).toMatchObject({
      actorName: "본사직원",
      actorEmail: "hq@example.com",
      reason: "고객 문의 확인",
      teacherName: null,
      teacherPhone: null,
      targetStudentName: null,
      tenantCode: null,
      content: "회원 목록",
    });
  });

  test("소속코드를 주면 그 기관 id 로 거른다", async () => {
    kit.state.rows.tenants = (filters) =>
      filters.code === "ABCD1234" ? { id: "tenant-7" } : null;

    await get({ tenantCode: "ABCD1234" });

    expect(logFilters[0]).toMatchObject({ tenant_id: "tenant-7" });
  });

  test("없는 소속코드는 로그를 읽지 않고 빈 목록을 돌려준다", async () => {
    kit.state.rows.tenants = () => null;

    const r = await get({ tenantCode: "NOPE0000" });

    expect(r.status).toBe(200);
    expect((r.body as Body).logs).toEqual([]);
    expect(logFilters).toHaveLength(0);
  });

  test("기간은 한국 날짜 기준으로 시작일 0시 이상, 종료일 다음 날 0시 미만이다", async () => {
    await get({ from: "2026-11-01", to: "2026-11-05" });

    expect(logFilters[0]).toMatchObject({
      "created_at>=": "2026-11-01T00:00:00+09:00",
      "created_at<": "2026-11-06T00:00:00+09:00",
    });
  });

  test("같은 시각의 줄이 쪽 사이에서 겹치지 않도록 id 내림차순으로 한 번 더 정렬한다", async () => {
    await get();

    expect(
      kit.state.orders.filter((o) => o.table === "admin_access_logs"),
    ).toEqual([
      { table: "admin_access_logs", column: "created_at" },
      { table: "admin_access_logs", column: "id" },
    ]);
  });

  test("구분을 주면 그 구분의 동작만 읽는다", async () => {
    await get({ kind: "edit" });

    const actions = logFilters[0]?.action as string[];
    expect(actions).toContain("settings_change");
    expect(actions).toContain("account_reissue");
    expect(actions).not.toContain("view");
    expect(actions).not.toContain("export");
  });

  test.each([
    [{ kind: "nope" }],
    [{ from: "2026/11/01" }],
    [{ to: "내일" }],
    [{ to: "2026-02-31" }],
    [{ page: "0" }],
    [{ page: "abc" }],
  ])("잘못된 조건 %j 은 400 이고 읽지 않는다", async (query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(logFilters).toHaveLength(0);
  });

  test("한 쪽은 50줄이고 다음 쪽이 있으면 hasNext 이다", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      ...TEACHER_VIEW_LOG,
      id: `log-${i}`,
    }));
    kit.state.rows.admin_access_logs = () => many;

    const first = await get();
    const third = await get({ page: "3" });

    expect((first.body as Body).logs).toHaveLength(50);
    expect((first.body as Body).hasNext).toBe(true);
    expect((third.body as Body).page).toBe(3);
    expect((third.body as Body).logs).toHaveLength(20);
    expect((third.body as Body).logs[0]?.id).toBe("log-100");
    expect((third.body as Body).hasNext).toBe(false);
  });
});
