// PUT /api/admin/members/:id/tenant 계약 검증. 소속 변경은 서비스 롤이 아니라 관리자 본인 토큰 클라이언트로 RPC 를 부른다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  type SectionDb,
} from "../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";
import {
  MEMBER_ID,
  OTHER_ID,
  seedMembersDb,
} from "../../../../_lib/members/membersTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
  // 관리자 본인 토큰으로 만든 클라이언트(auth.uid() 가 관리자). 소속 RPC 는 여기로만 나가야 한다.
  userState: null as unknown as KitState,
  userClientTokens: [] as string[],
}));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  getEnv: (name: string) => process.env[name],
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

vi.mock("../../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.userClientTokens.push(token);
    return createFakeAdmin(kit.userState);
  },
}));

import handler from "./tenant.js";

const TENANT = "9f506e7f-8192-43a4-8ebf-3a4b5c6d7e8f";

const put = (body: unknown, id = MEMBER_ID) =>
  callHandler(handler, body, "PUT", { id });

const TABLES = {
  profiles: [{ id: MEMBER_ID, member_type: "student", tenant_id: null }],
  tenants: [{ id: TENANT, name: "한빛 학원" }],
};

const rpcCalls: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "edit", TABLES, "view");
  kit.userState = createKitState();
  kit.userClientTokens.length = 0;
  rpcCalls.length = 0;
  kit.userState.rpc.fn_admin_set_profile_tenant = (args) => {
    rpcCalls.push(args);
    // 실제 함수가 profiles.tenant_id 를 바꾼 것처럼 메모리 DB 를 맞춘다.
    const row = kit.db.tables.profiles?.find((p) => p.id === args.p_profile_id);
    if (row) row.tenant_id = args.p_tenant_id;
    return { data: null, error: null };
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PUT /api/admin/members/:id/tenant", () => {
  test("edit 권한이면 관리자 토큰 클라이언트로 RPC 를 부르고 고친 회원을 돌려준다", async () => {
    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: MEMBER_ID,
      tenant_id: TENANT,
      tenant_name: "한빛 학원",
    });
    // 함수가 auth.uid() 로 권한과 변경자를 보므로 서비스 롤로 부르지 않는다.
    expect(kit.userClientTokens).toEqual(["token"]);
    expect(rpcCalls).toEqual([
      { p_profile_id: MEMBER_ID, p_tenant_id: TENANT },
    ]);
    expect(kit.state.events).not.toContain("rpc:fn_admin_set_profile_tenant");
  });

  test("tenants 보기 권한이 없으면 응답의 tenant_name 은 null 이고 tenants 를 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "edit", TABLES);

    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tenant_id: TENANT, tenant_name: null });
    expect(kit.db.calls.some((c) => c.table === "tenants")).toBe(false);
  });

  test("학생이 아니면 소속 없음(null)으로 바꿀 수 있다", async () => {
    kit.db.tables.profiles = [
      { id: MEMBER_ID, member_type: "parent", tenant_id: TENANT },
      ...(kit.db.tables.profiles ?? []).filter((p) => p.id !== MEMBER_ID),
    ];

    const r = await put({ tenantId: null });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tenant_id: null, tenant_name: "" });
    expect(rpcCalls).toEqual([{ p_profile_id: MEMBER_ID, p_tenant_id: null }]);
  });

  test("스쿨멘토에서 학생을 소속 없음으로 바꾸면 400 STUDENT_TENANT_REQUIRED 이고 RPC 를 부르지 않는다", async () => {
    const r = await put({ tenantId: null });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "STUDENT_TENANT_REQUIRED",
      detail: "학생은 소속 없음으로 바꿀 수 없어요. 「기타」로 옮겨 주세요.",
    });
    expect(kit.userClientTokens).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  test("위닝에서는 학생도 소속 없음으로 바꿀 수 있다", async () => {
    vi.stubEnv("SITE", "winning");

    const r = await put({ tenantId: null });

    expect(r.status).toBe(200);
    expect(rpcCalls).toEqual([{ p_profile_id: MEMBER_ID, p_tenant_id: null }]);
  });

  test("view 권한만 있으면 403 이고 RPC 를 부르지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "view", TABLES);

    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(403);
    expect(kit.userClientTokens).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  test("권한이 없으면 403 이고 RPC 를 부르지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect((await put({ tenantId: TENANT })).status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  test("QA 계정은 쓰지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "admin-1" });

    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  test.each([
    ["본문 없음", undefined],
    ["tenantId 없음", {}],
    ["uuid 가 아닌 tenantId", { tenantId: "t-1" }],
    ["문자열 빈 값", { tenantId: "" }],
    ["모르는 키", { tenantId: TENANT, role: "admin" }],
  ])("%s 이면 400 이고 RPC 를 부르지 않는다", async (_label, body) => {
    const r = await put(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(rpcCalls).toHaveLength(0);
  });

  test("uuid 가 아닌 id 는 400", async () => {
    const r = await put({ tenantId: TENANT }, "x");

    expect(r.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  test("없는 회원은 404 NOT_FOUND 이고 RPC 를 부르지 않는다", async () => {
    const r = await put({ tenantId: TENANT }, OTHER_ID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(rpcCalls).toHaveLength(0);
  });

  test.each([
    [
      { code: "23505", message: "dup" },
      409,
      "PHONE_TAKEN",
      "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
    ],
    [
      { code: "WC100", message: "enrolled" },
      409,
      "OTHER_TENANT_ENROLLMENT",
      "이 학생은 올해 학적이 다른 기관에 있어요. 학생 기관 이동 화면에서 옮겨 주세요.",
    ],
    [
      { code: "WC072", message: "denied" },
      403,
      "FORBIDDEN",
      "회원 관리 수정 권한이 없습니다.",
    ],
    [
      { code: "P0001", message: "tenant_not_found" },
      404,
      "TENANT_NOT_FOUND",
      "기관을 찾을 수 없어요.",
    ],
  ])("RPC 오류 %j 는 %i %s 로 바뀐다", async (error, status, code, detail) => {
    kit.userState.rpc.fn_admin_set_profile_tenant = () => ({
      data: null,
      error,
    });

    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ code, detail });
  });

  test("알 수 없는 RPC 오류는 500 INTERNAL_ERROR 이고 DB 메시지를 싣지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.userState.rpc.fn_admin_set_profile_tenant = () => ({
      data: null,
      error: { code: "XX000", message: "secret db detail" },
    });

    const r = await put({ tenantId: TENANT });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(JSON.stringify(r.body)).not.toContain("secret db detail");
  });
});
