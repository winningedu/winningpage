// /api/admin/tenants 계약 검증. GET 은 메뉴 tenants view 이상으로 기관 목록과 유예일수를 { items, graceDays } 로 돌려주고,
// POST 는 edit 로 fn_create_tenant 를 관리자 본인 토큰 클라이언트로 불러 새 기관을 만든다(최고 관리자 게이트와 created_by 가 auth.uid() 를 쓴다).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  // 관리자 본인 토큰으로 만든 클라이언트(auth.uid() 가 관리자). 쓰기는 여기로만 나가야 한다.
  userState: null as unknown as KitState,
  userClientTokens: [] as string[],
  hqTenantAdmin: true,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.userClientTokens.push(token);
    return createFakeAdmin(kit.userState);
  },
}));

vi.mock("../../../src/config/sites.js", () => ({
  SITES: {
    schoolmentor: {
      features: {
        get hqTenantAdmin() {
          return kit.hqTenantAdmin;
        },
      },
    },
  },
}));

import { callHandler } from "../../_lib/tenantRoute.testkit.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/tenants" };

const get = () => callHandler(handler, undefined, "GET");
const post = (body: unknown) => callHandler(handler, body, "POST");

const TENANT_ROW = {
  id: "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  code: "ABCD1234",
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "W",
  created_at: "2026-11-01T00:00:00Z",
};

const CREATE = {
  name: " 한빛고 ",
  region: "서울",
  org_type: "학교",
  tier: "W",
};

function grant(level: "view" | "edit" | "none" | null) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: level ? [{ resource_key: "tenants", level }] : [],
    error: null,
  });
}

beforeEach(() => {
  process.env.SITE = "schoolmentor";
  kit.hqTenantAdmin = true;
  kit.userClientTokens.length = 0;
  kit.userState = createKitState();
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("view");
  kit.state.rows.tenants = () => [TENANT_ROW];
  kit.state.rows.app_settings = (filters) =>
    filters.key === "contract_grace_days" ? { value: 30 } : null;
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants", () => {
  test.each([
    ["권한 없음", null],
    ["tenants none", "none" as const],
  ])("%s 이면 403 이고 기관을 읽지 않는다", async (_label, level) => {
    grant(level);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain("tenants");
  });

  test("view 권한이면 최신순 목록과 유예일수를 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [TENANT_ROW], graceDays: 30 });
    const read = kit.state.reads.find((x) => x.table === "tenants");
    expect(read?.orderBy).toEqual({ column: "created_at", ascending: false });
  });

  test("hqTenantAdmin 이 켜져 있으면 계약 칼럼까지 읽는다", async () => {
    await get();

    const read = kit.state.reads.find((x) => x.table === "tenants");
    expect(read?.select).toContain("contract_end_date");
    expect(read?.select).toContain("time_zone");
  });

  test("hqTenantAdmin 이 꺼져 있으면 기본 칼럼만 읽고 유예일수는 null 이며 설정을 읽지 않는다", async () => {
    kit.hqTenantAdmin = false;

    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [TENANT_ROW], graceDays: null });
    const read = kit.state.reads.find((x) => x.table === "tenants");
    expect(read?.select).toBe(
      "id, code, name, region, org_type, tier, created_at",
    );
    expect(kit.state.reads.map((x) => x.table)).not.toContain("app_settings");
  });

  test.each([
    ["숫자가 아닌 값", { value: "30" }],
    ["행 없음", null],
  ])("유예일수 설정이 %s 이면 null 이다", async (_label, row) => {
    kit.state.rows.app_settings = () => row;

    const r = await get();

    expect(r.body).toMatchObject({ graceDays: null });
  });

  test("기관 조회가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rows.tenants = () => {
      throw new Error("boom");
    };

    const r = await get();

    expect(r.status).toBe(500);
  });
});

describe("POST /api/admin/tenants", () => {
  beforeEach(() => {
    grant("edit");
    kit.userState.rpc.fn_create_tenant = () => ({
      data: TENANT_ROW,
      error: null,
    });
  });

  test("view 권한이면 403 이고 만들지 않는다", async () => {
    grant("view");

    const r = await post(CREATE);

    expect(r.status).toBe(403);
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 fn_create_tenant 를 불러 201 로 만든 행을 돌려준다", async () => {
    let args: Record<string, unknown> = {};
    kit.userState.rpc.fn_create_tenant = (a) => {
      args = a;
      return { data: TENANT_ROW, error: null };
    };

    const r = await post(CREATE);

    expect(r.status).toBe(201);
    expect(r.body).toEqual(TENANT_ROW);
    expect(args).toEqual({
      p_name: "한빛고",
      p_region: "서울",
      p_org_type: "학교",
      p_tier: "W",
    });
    // fn_create_tenant 가 auth.uid() 로 최고 관리자를 보고 created_by 를 채우므로 service_role 로 부르지 않는다.
    expect(kit.userClientTokens).toEqual(["token"]);
    expect(kit.state.events).not.toContain("rpc:fn_create_tenant");
  });

  test.each([
    ["본문 없음", undefined],
    ["이름이 공백뿐", { ...CREATE, name: "   " }],
    ["이름 없음", { region: "서울", org_type: "학교", tier: "W" }],
    ["지역 없음", { name: "한빛고", org_type: "학교", tier: "W" }],
    ["기관 유형이 문자열이 아님", { ...CREATE, org_type: 3 }],
    ["등급 없음", { name: "한빛고", region: "서울", org_type: "학교" }],
    ["허용 목록에 없는 키", { ...CREATE, is_catch_all: true }],
    ["created_by 같은 실제 칼럼", { ...CREATE, created_by: "x" }],
  ])("%s 이면 400 이고 만들지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("최고 관리자가 아니면(WC067) 403 NOT_SUPER_ADMIN 과 안내 문구다", async () => {
    kit.userState.rpc.fn_create_tenant = () => ({
      data: null,
      error: { code: "WC067", message: "not_super_admin" },
    });

    const r = await post(CREATE);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      status: 403,
      code: "NOT_SUPER_ADMIN",
      detail: "최고 관리자만 소속을 등록할 수 있습니다.",
    });
  });

  test("그 밖의 DB 오류는 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.userState.rpc.fn_create_tenant = () => ({
      data: null,
      error: { code: "XX000", message: "boom" },
    });

    const r = await post(CREATE);

    expect(r.status).toBe(500);
  });

  test("QA 계정은 만들지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await post(CREATE);

    expect(r.status).toBe(403);
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("GET, POST 이외의 메서드는 405 이다", async () => {
    const r = await callHandler(handler, CREATE, "DELETE");

    expect(r.status).toBe(405);
  });
});
