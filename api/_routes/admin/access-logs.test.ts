// GET /api/admin/access-logs 계약 검증(사 #170, 교 #66, 결정 102.5). 메뉴 권한(adminAccessLogs view)과
// 최고 관리자(데이터 술어)를 모두 통과한 사람만 읽고, 교사 이름, 로그인 아이디, 가린 전화번호,
// 가린 학생 이름을 붙여 한 줄씩 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  accessLogCreatedSchema,
  accessLogPageSchema,
} from "../../../shared/access-log/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  role: "admin",
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => fakeAdminWithInsertReturning(),
}));

import { app } from "../app.js";

// 공용 가짜의 insert 는 await 만 되므로, insert().select().single() 체인을 얹는다.
function fakeAdminWithInsertReturning() {
  const admin = createFakeAdmin(kit.state);
  const from = admin.from;
  return {
    ...admin,
    from: (table: string) => {
      const chain = from(table) as Record<string, unknown>;
      const insert = chain.insert as (
        row: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
      chain.insert = (row: Record<string, unknown>) => {
        const written = insert(row);
        return {
          select: () => ({
            single: async () => {
              const { error } = await written;
              return error
                ? { data: null, error }
                : {
                    data: { id: "log-new", created_at: "2026-11-24T01:02:03Z" },
                    error: null,
                  };
            },
          }),
        };
      };
      return chain;
    },
  };
}

const route = { app, path: "/api/admin/access-logs" };

type Captured = Awaited<ReturnType<typeof callRoute>>;

// 토큰을 뺀 요청은 Authorization 을 빈 값으로 보낸다.
const call = (
  method: string,
  body: unknown,
  query: Record<string, string> = {},
  withToken = true,
): Promise<Captured> =>
  callRoute(route, {
    method,
    body,
    query,
    ...(withToken ? {} : { headers: { authorization: "" } }),
  });

const get = (query: Record<string, string> = {}, method = "GET") =>
  call(method, undefined, query);

interface Body {
  items: Record<string, unknown>[];
  page: number;
  hasNext: boolean;
}

const PROBLEM_KEYS = ["code", "detail", "status", "title", "type"];

function expectProblem(r: Captured, status: number, code: string) {
  expect(r.status).toBe(status);
  expect(Object.keys(r.body as object).sort()).toEqual(
    expect.arrayContaining(PROBLEM_KEYS),
  );
  expect(r.body).toMatchObject({ status, code });
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
  kit.role = "admin";
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "adminAccessLogs", level: "view" }],
    error: null,
  });
  logFilters.length = 0;
  kit.state.rows.admin_access_logs = (filters) => {
    logFilters.push({ ...filters });
    return [TEACHER_VIEW_LOG];
  };
  kit.state.rows.teachers = (filters) => matchRows(TEACHERS, filters);
  // eq("id", 토큰 사용자)는 관리자 판정용 한 줄, in("id", [...])는 이름 조회용 목록이다.
  kit.state.rows.profiles = (filters) =>
    Array.isArray(filters.id)
      ? matchRows(PROFILES, filters)
      : { role: kit.role };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/access-logs", () => {
  test("최고 관리자가 아니면 403 problem 이고 로그를 읽지 않는다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({ data: false, error: null });

    const r = await get();

    expectProblem(r, 403, "FORBIDDEN");
    expect(r.body).toMatchObject({ detail: "최고 관리자만 볼 수 있습니다." });
    expect(logFilters).toHaveLength(0);
  });

  test("adminAccessLogs 메뉴 권한이 없으면 403 이고 로그를 읽지 않는다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [],
      error: null,
    });

    const r = await get();

    expectProblem(r, 403, "FORBIDDEN");
    expect(logFilters).toHaveLength(0);
  });

  test("관리자가 아니면 403 이다", async () => {
    kit.role = "user";

    const r = await get();

    expectProblem(r, 403, "FORBIDDEN");
    expect(logFilters).toHaveLength(0);
  });

  test("최고 관리자 판정 조회가 실패하면 500 problem 이다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({
      data: null,
      error: { message: "boom" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await get();

    expectProblem(r, 500, "INTERNAL_ERROR");
    expect(r.body).toMatchObject({
      detail: "접근 로그를 불러오지 못했습니다.",
    });
  });

  test("GET 과 POST 가 아닌 메서드는 405 METHOD_NOT_ALLOWED 이고 Allow 가 GET, HEAD, POST 다", async () => {
    const r = await get({}, "DELETE");

    expectProblem(r, 405, "METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("GET, HEAD, POST");
  });

  test("교사 이름, 로그인 아이디, 가린 전화번호와 가린 학생 이름을 한 줄로 붙인다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(accessLogPageSchema.safeParse(r.body).success).toBe(true);
    const body = r.body as Body;
    expect(Object.keys(body).sort()).toEqual(["hasNext", "items", "page"]);
    expect(body.items).toEqual([
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

    expect((r.body as Body).items[0]).toMatchObject({
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
    expect(r.body).toEqual({ items: [], page: 1, hasNext: false });
    expect(logFilters).toHaveLength(0);
  });

  test("기간은 from 이상, to 미만인 ISO Z 시각으로 그대로 거른다", async () => {
    await get({
      from: "2026-10-31T15:00:00.000Z",
      to: "2026-11-05T15:00:00.000Z",
    });

    expect(logFilters[0]).toMatchObject({
      "created_at>=": "2026-10-31T15:00:00.000Z",
      "created_at<": "2026-11-05T15:00:00.000Z",
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

  test("빈 문자열 조건은 없는 것으로 본다", async () => {
    const r = await get({
      tenantCode: "",
      from: "",
      to: "",
      kind: "",
      page: "",
    });

    expect(r.status).toBe(200);
    expect((r.body as Body).page).toBe(1);
    expect(logFilters).toHaveLength(1);
  });

  test("구분을 주면 그 구분의 동작만 읽는다", async () => {
    await get({ kind: "edit" });

    const actions = logFilters[0]?.action as string[];
    expect(actions).toContain("settings_change");
    expect(actions).toContain("account_reissue");
    expect(actions).not.toContain("view");
    expect(actions).not.toContain("export");
  });

  test("등록 구분은 create 동작만 읽는다", async () => {
    await get({ kind: "create" });

    expect(logFilters[0]?.action).toEqual(["create"]);
  });

  test("출력 구분은 export 와 download 동작을 읽는다", async () => {
    await get({ kind: "export" });

    const actions = logFilters[0]?.action as string[];
    expect(actions).toEqual(expect.arrayContaining(["export", "download"]));
    expect(actions).not.toContain("view");
  });

  test.each([
    [{ kind: "nope" }],
    [{ page: "1.5" }],
    [{ from: "2026/11/01" }],
    [{ from: "2026-11-01" }],
    [{ from: "2026-11-01T00:00:00+09:00" }],
    [{ to: "내일" }],
    [{ to: "2026-02-31T00:00:00Z" }],
    [{ page: "0" }],
    [{ page: "abc" }],
  ])("잘못된 조건 %j 은 400 이고 읽지 않는다", async (query) => {
    const r = await get(query);

    expectProblem(r, 400, "VALIDATION_FAILED");
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

    expect((first.body as Body).items).toHaveLength(50);
    expect((first.body as Body).hasNext).toBe(true);
    expect((third.body as Body).page).toBe(3);
    expect((third.body as Body).items).toHaveLength(20);
    expect((third.body as Body).items[0]?.id).toBe("log-100");
    expect((third.body as Body).hasNext).toBe(false);
  });
});

const VALID_POST = {
  action: "download",
  resourceKey: "members",
  reason: "  정산 대사  ",
  rowCount: 12,
};

const post = (body: unknown, withToken = true) =>
  call("POST", body, {}, withToken);

describe("POST /api/admin/access-logs", () => {
  beforeEach(() => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "members", level: "view" }],
      error: null,
    });
    kit.state.auth.getUserById.mockResolvedValue({
      data: { user: { email: "hq@example.com" } },
      error: null,
    });
  });

  test("본문 메뉴의 view 권한이면 토큰 사용자와 인증 이메일로 적재하고 201 로 id 를 돌려준다", async () => {
    const r = await post(VALID_POST);

    expect(r.status).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toEqual({
      id: "log-new",
      createdAt: "2026-11-24T01:02:03Z",
    });
    expect(accessLogCreatedSchema.safeParse(r.body).success).toBe(true);
    expect(kit.state.auth.getUserById).toHaveBeenCalledWith("hq-1");
    expect(kit.state.inserts).toEqual([
      {
        table: "admin_access_logs",
        row: {
          profile_id: "hq-1",
          actor_email: "hq@example.com",
          action: "download",
          resource_key: "members",
          reason: "정산 대사",
          row_count: 12,
          target_id: null,
        },
      },
    ]);
  });

  test("마스킹 해제는 대상 id 를 남기고 건수는 비운다", async () => {
    await post({
      action: "unmask",
      resourceKey: "members",
      reason: "환불 문의 응대",
      targetId: "member-9",
    });

    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "unmask",
      target_id: "member-9",
      row_count: null,
    });
  });

  test("본문의 profile_id 와 actor_email 은 무시한다", async () => {
    await post({
      ...VALID_POST,
      profile_id: "someone-else",
      actor_email: "forged@example.com",
    });

    expect(kit.state.inserts[0]?.row).toMatchObject({
      profile_id: "hq-1",
      actor_email: "hq@example.com",
    });
  });

  test.each([
    [{ ...VALID_POST, reason: "   " }],
    [{ ...VALID_POST, reason: undefined }],
    [{ ...VALID_POST, action: "view" }],
    [{ ...VALID_POST, rowCount: -1 }],
    [{ ...VALID_POST, rowCount: 1.5 }],
  ])("잘못된 본문 %j 은 400 이고 적재하지 않는다", async (body) => {
    const r = await post(body);

    expectProblem(r, 400, "VALIDATION_FAILED");
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("본문 메뉴의 권한이 없으면 403 이고 적재하지 않는다", async () => {
    const r = await post({ ...VALID_POST, resourceKey: "revenue" });

    expectProblem(r, 403, "FORBIDDEN");
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("resourceKey 가 없으면 403 이다", async () => {
    const r = await post({ ...VALID_POST, resourceKey: undefined });

    expectProblem(r, 403, "FORBIDDEN");
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("JSON 이 아닌 본문은 권한 키를 알 수 없어 403 이고 적재하지 않는다", async () => {
    const response = await app.request("/api/admin/access-logs", {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(403);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("토큰이 없으면 401 이다", async () => {
    const r = await post(VALID_POST, false);

    expectProblem(r, 401, "UNAUTHENTICATED");
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("인증 이메일을 못 구하면 500 이고 적재하지 않는다", async () => {
    kit.state.auth.getUserById.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await post(VALID_POST);

    expectProblem(r, 500, "INTERNAL_ERROR");
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("적재가 실패하면 500 이다", async () => {
    kit.state.insertErrors.admin_access_logs = { message: "rls" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await post(VALID_POST);

    expectProblem(r, 500, "INTERNAL_ERROR");
  });
});
