// /api/admin/tenants/:id 계약 검증. GET 은 기관 한 곳의 행을, PATCH 는 updated_at 낙관적 잠금으로 기관 정보를 고친다.
// 수정은 관리자 본인 토큰 클라이언트로 한다(tenants 계약 칼럼 변경 이력 트리거가 auth.uid() 를 변경자로 남긴다).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
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

import handler from "./[id].js";

const TENANT = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const LOADED_AT = "2026-11-20T01:02:03.456789+00:00";

// 디스패처가 경로의 :id 를 req.query.id 에 넣어 준다(경로 값이 쿼리스트링 값을 덮어쓴다).
const get = (query: Record<string, string> = { id: TENANT }) =>
  callHandler(handler, undefined, "GET", query);
const patch = (body: unknown, id: string = TENANT) =>
  callHandler(handler, body, "PATCH", { id });

const ROW = {
  id: TENANT,
  code: "ABCD1234",
  name: "한빛고",
  updated_at: LOADED_AT,
};

// src/pages/admin/tenants/form.ts 의 tenantPayload 가 돌려주는 값과 같은 모양.
const VALUES = {
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "W",
  contract_start_date: "2026-03-01",
  contract_end_date: "2027-02-28",
  term_months: 6,
  mou_status: "체결",
  grace_ends_on: "2027-03-31",
  trial_start_date: null,
  trial_end_date: null,
  contact_name: "박담당",
  contact_phone: "02-123-4567",
  contact_mobile: "010-1234-5678",
  contact_email: "park@example.com",
  address: "서울시 중구 1",
  main_phone: "02-765-4321",
  homepage: "https://school.example.com",
};
const BODY = { updatedAt: LOADED_AT, values: VALUES };

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
  kit.state.rows.tenants = (filters) => (filters.id === TENANT ? ROW : null);
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/:id", () => {
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

  test("view 권한이면 기관 행을 그대로 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
    const read = kit.state.reads.find((x) => x.table === "tenants");
    expect(read?.select).toContain("trial_end_date");
    expect(read?.select).toContain("updated_at");
  });

  test("없는 기관은 404 NOT_FOUND", async () => {
    const r = await get({ id: "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c" });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test.each([
    ["id 없음", {}],
    ["uuid 가 아닌 id", { id: "tenant-7" }],
  ])("%s 이면 400 이다", async (_label, query) => {
    const r = await get(query);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("PATCH /api/admin/tenants/:id", () => {
  const saved = [
    { id: TENANT, updated_at: "2026-11-24T05:00:00.000000+00:00" },
  ];

  beforeEach(() => {
    grant("edit");
    kit.userState.rows.tenants = () => saved;
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    grant("view");

    const r = await patch(BODY);

    expect(r.status).toBe(403);
    expect(kit.userClientTokens).toHaveLength(0);
    expect(kit.userState.updates).toHaveLength(0);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 id 와 updated_at 이 맞는 행만 고치고 새 updated_at 을 돌려준다", async () => {
    const r = await patch(BODY);

    expect(r.status).toBe(200);
    expect(r.body).toEqual(saved[0]);
    expect(kit.userClientTokens).toEqual(["token"]);
    expect(kit.userState.updates).toEqual([
      {
        table: "tenants",
        values: VALUES,
        filters: { id: TENANT, updated_at: LOADED_AT },
      },
    ]);
    expect(kit.state.updates).toHaveLength(0);
  });

  test("목록에 없는 칸(code, is_catch_all)은 버리고 쓰지 않는다", async () => {
    await patch({
      ...BODY,
      values: { ...VALUES, code: "ZZZZ9999", is_catch_all: true },
    });

    expect(kit.userState.updates[0]?.values).toEqual(VALUES);
  });

  test("바뀐 행이 없고 기관도 없으면 404 NOT_FOUND", async () => {
    kit.userState.rows.tenants = () => [];
    kit.state.rows.tenants = () => null;

    const r = await patch(BODY);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  test("바뀐 행이 없고 updated_at 이 달라졌으면 409 CONFLICT", async () => {
    kit.userState.rows.tenants = () => [];
    kit.state.rows.tenants = () => ({
      updated_at: "2026-11-24T04:00:00+00:00",
    });

    const r = await patch(BODY);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      status: 409,
      code: "CONFLICT",
      detail: "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.",
    });
  });

  test("바뀐 행이 없는데 updated_at 이 그대로면 403 FORBIDDEN(수정 권한 없음)", async () => {
    kit.userState.rows.tenants = () => [];
    kit.state.rows.tenants = () => ({ updated_at: LOADED_AT });

    const r = await patch(BODY);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      detail: "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.",
    });
  });

  test.each([
    [
      "tenants_contract_order",
      "CONTRACT_ORDER",
      "계약 시작일은 종료일보다 늦을 수 없어요.",
    ],
    [
      "tenants_grace_after_end",
      "GRACE_ORDER",
      "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.",
    ],
    [
      "tenants_trial_order",
      "TRIAL_ORDER",
      "시범 시작일은 종료일보다 늦을 수 없어요.",
    ],
  ])("제약 %s 위반(23514)은 400 %s 이다", async (constraint, code, detail) => {
    kit.userState.updateErrors.tenants = () => ({
      code: "23514",
      message: `new row for relation "tenants" violates check constraint "${constraint}"`,
    });

    const r = await patch(BODY);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code, detail });
  });

  test("이름을 모르는 23514 와 그 밖의 DB 오류는 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.userState.updateErrors.tenants = () => ({
      code: "23514",
      message: 'violates check constraint "other_check"',
    });

    const r = await patch(BODY);

    expect(r.status).toBe(500);
  });

  test.each([
    ["본문 없음", undefined],
    ["updatedAt 없음", { values: VALUES }],
    ["빈 updatedAt", { ...BODY, updatedAt: "" }],
    ["values 없음", { updatedAt: LOADED_AT }],
    ["이름이 공백뿐", { ...BODY, values: { ...VALUES, name: "  " } }],
    ["빠진 칸", { ...BODY, values: { ...VALUES, homepage: undefined } }],
    ["학기 길이 4", { ...BODY, values: { ...VALUES, term_months: 4 } }],
    [
      "날짜 형식 오류",
      { ...BODY, values: { ...VALUES, contract_end_date: "2027/02/28" } },
    ],
    [
      "이메일 형식 오류",
      { ...BODY, values: { ...VALUES, contact_email: "not-an-email" } },
    ],
    [
      "전화번호 형식 오류",
      { ...BODY, values: { ...VALUES, main_phone: "02 765 4321" } },
    ],
    [
      "홈페이지가 http 로 시작하지 않음",
      { ...BODY, values: { ...VALUES, homepage: "javascript:alert(1)" } },
    ],
  ])("%s 이면 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await patch(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("경로 id 가 uuid 가 아니면 400 이고 쓰지 않는다", async () => {
    const r = await patch(BODY, "tenant-7");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.userClientTokens).toHaveLength(0);
  });

  test("본문에 id 를 실어 보내도 경로 id 만 쓴다", async () => {
    const other = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";

    await patch({ ...BODY, id: other });

    expect(kit.userState.updates[0]?.filters).toEqual({
      id: TENANT,
      updated_at: LOADED_AT,
    });
  });

  test("선택 칸을 비우면(null) 그대로 쓴다", async () => {
    const values = {
      ...VALUES,
      term_months: null,
      contract_end_date: null,
      homepage: null,
    };

    const r = await patch({ ...BODY, values });

    expect(r.status).toBe(200);
    expect(kit.userState.updates[0]?.values).toEqual(values);
  });

  test("위닝 사이트에서도 같은 권한으로 열린다", async () => {
    process.env.SITE = "winning";

    const r = await patch(BODY);

    expect(r.status).toBe(200);
  });

  test("QA 계정은 고치지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "hq-1" });

    const r = await patch(BODY);

    expect(r.status).toBe(403);
    expect(kit.userState.updates).toHaveLength(0);
  });

  test("GET, PATCH 이외의 메서드는 405 이다", async () => {
    const r = await callHandler(handler, BODY, "POST");

    expect(r.status).toBe(405);
  });
});
