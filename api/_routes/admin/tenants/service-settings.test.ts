// /api/admin/tenants/service-settings 계약 검증(사 #160, #164, #166, 결정 r5, r6). GET 은 기관의 서비스별 설정 행과 b2b 이용 기본값을,
// PUT 은 한 서비스 행의 upsert 를 관리자 본인 토큰 클라이언트로 한다(변경 이력 트리거가 auth.uid() 를 변경자로 남긴다).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  // 관리자 본인 토큰으로 만든 클라이언트(auth.uid() 가 관리자). 쓰기는 여기로만 나가야 한다.
  userState: null as unknown as KitState,
  userClientTokens: [] as string[],
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.userClientTokens.push(token);
    return createFakeAdmin(kit.userState);
  },
}));

import handler from "./service-settings.js";

const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER_TENANT = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";

const get = (query: Record<string, string> = { tenantId: TENANT }) =>
  callHandler(handler, undefined, "GET", query);
const put = (body: unknown) => callHandler(handler, body, "PUT");

const SETTINGS = [
  {
    tenant_id: TENANT,
    program_key: "diagnose",
    enabled: true,
    starts_on: "2026-03-01",
    ends_on: null,
    monthly_limit: 3,
    term_limit: 24,
  },
  {
    tenant_id: OTHER_TENANT,
    program_key: "growth",
    enabled: true,
    starts_on: null,
    ends_on: null,
    monthly_limit: 9,
    term_limit: null,
  },
];
const DEFAULTS = { diagnose: { monthly_limit: 3 } };

const ROW = {
  tenant_id: TENANT,
  program_key: "growth",
  enabled: true,
  starts_on: "2026-03-01",
  ends_on: "2026-08-31",
  monthly_limit: 4,
  term_limit: null,
};
const SAVED = {
  program_key: "growth",
  enabled: true,
  starts_on: "2026-03-01",
  ends_on: "2026-08-31",
  monthly_limit: 4,
  term_limit: null,
};

function grant(level: "view" | "edit" | "none" | null) {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: level ? [{ resource_key: "tenants", level }] : [],
    error: null,
  });
}

beforeEach(() => {
  process.env.SITE = "schoolmentor";
  kit.userClientTokens.length = 0;
  kit.userState = createKitState();
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("view");
  // 가짜 클라이언트는 select 열을 자르지 않아 서버가 고른 열(tenant_id 제외)만 남겨 흉내 낸다.
  kit.state.rows.tenant_service_settings = (filters) =>
    matchRows(SETTINGS, filters).map(({ tenant_id: _tenant, ...rest }) => rest);
  kit.state.rows.app_settings = (filters) =>
    filters.key === "b2b_usage_defaults" ? { value: DEFAULTS } : null;
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/service-settings", () => {
  test.each([
    ["권한 없음", null],
    ["tenants none", "none" as const],
  ])("%s 이면 403 이고 아무것도 읽지 않는다", async (_label, level) => {
    grant(level);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain(
      "tenant_service_settings",
    );
  });

  test("view 권한이면 그 기관의 설정 행과 이용 기본값을 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          program_key: "diagnose",
          enabled: true,
          starts_on: "2026-03-01",
          ends_on: null,
          monthly_limit: 3,
          term_limit: 24,
        },
      ],
      defaults: DEFAULTS,
    });
    const read = kit.state.reads.find(
      (x) => x.table === "tenant_service_settings",
    );
    expect(read?.select).toBe(
      "program_key, enabled, starts_on, ends_on, monthly_limit, term_limit",
    );
  });

  test.each([
    ["행 없음", null],
    ["객체가 아닌 값", { value: 3 }],
    ["배열", { value: [] }],
  ])("이용 기본값이 %s 이면 빈 객체다", async (_label, row) => {
    kit.state.rows.app_settings = () => row;

    const r = await get();

    expect(r.body).toMatchObject({ defaults: {} });
  });

  test.each([
    ["tenantId 없음", {}],
    ["uuid 가 아닌 tenantId", { tenantId: "tenant-7" }],
  ])("%s 이면 400 이다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("설정 조회가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.rows.tenant_service_settings = () => {
      throw new Error("boom");
    };

    const r = await get();

    expect(r.status).toBe(500);
  });
});

describe("PUT /api/admin/tenants/service-settings", () => {
  beforeEach(() => {
    grant("edit");
    kit.userState.rows.tenant_service_settings = () => SAVED;
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    grant("view");

    const r = await put(ROW);

    expect(r.status).toBe(403);
    expect(kit.userClientTokens).toHaveLength(0);
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 upsert 하고 updated_by 를 서버가 채우며 저장된 행을 돌려준다", async () => {
    const r = await put(ROW);

    expect(r.status).toBe(200);
    expect(r.body).toEqual(SAVED);
    expect(kit.userClientTokens).toEqual(["token"]);
    expect(kit.state.upserts).toHaveLength(0);
    expect(kit.userState.upserts).toHaveLength(1);
    expect(kit.userState.upserts[0]).toMatchObject({
      table: "tenant_service_settings",
      row: { ...ROW, updated_by: "hq-1" },
      onConflict: "tenant_id,program_key",
    });
  });

  test("클라이언트가 보낸 updated_by 는 무시하고 updated_at 은 서버 시각 UTC 로 채운다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T05:00:00Z"));
    try {
      await put({
        ...ROW,
        updated_by: "someone-else",
        updated_at: "1999-01-01T00:00:00Z",
      });
    } finally {
      vi.useRealTimers();
    }

    expect(kit.userState.upserts[0]?.row).toMatchObject({
      updated_by: "hq-1",
      updated_at: "2026-11-24T05:00:00.000Z",
    });
  });

  test("끄기(enabled false)도 행은 그대로 upsert 한다", async () => {
    await put({ ...ROW, enabled: false });

    expect(kit.userState.upserts[0]?.row).toMatchObject({ enabled: false });
  });

  test("한도를 비우면(null) 그대로 쓴다", async () => {
    await put({ ...ROW, monthly_limit: null, starts_on: null, ends_on: null });

    expect(kit.userState.upserts[0]?.row).toMatchObject({
      monthly_limit: null,
      starts_on: null,
      ends_on: null,
    });
  });

  test.each([
    ["본문 없음", undefined],
    ["tenant_id 가 uuid 가 아님", { ...ROW, tenant_id: "t-1" }],
    ["모르는 program_key", { ...ROW, program_key: "x" }],
    ["enabled 가 불리언이 아님", { ...ROW, enabled: "yes" }],
    ["0 한도", { ...ROW, monthly_limit: 0 }],
    ["32768 한도", { ...ROW, term_limit: 32768 }],
    ["소수 한도", { ...ROW, monthly_limit: 1.5 }],
    ["날짜 형식 오류", { ...ROW, starts_on: "2026/03/01" }],
    [
      "시작일이 종료일보다 늦음",
      { ...ROW, starts_on: "2026-09-01", ends_on: "2026-08-31" },
    ],
  ])("%s 이면 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await put(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("DB 가 거절하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.userState.insertErrors.tenant_service_settings = { code: "42501" };

    const r = await put(ROW);

    expect(r.status).toBe(500);
  });

  test("QA 계정은 쓰지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await put(ROW);

    expect(r.status).toBe(403);
    expect(kit.userState.upserts).toHaveLength(0);
  });

  test("GET, PUT 이외의 메서드는 405 이다", async () => {
    const r = await callHandler(handler, ROW, "POST");

    expect(r.status).toBe(405);
  });
});
