// POST /api/send-phone-code 의 기관별 번호 중복 검사(스쿨멘토 가입).
//
// 한도 검사(checkSendLimits)는 DB 밖 협력자라 "쿨타임" 429로 바꿔 끼우고,
// 번호 중복 검사를 통과했는지(429) 걸렸는지(409)로 판정한다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "./_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

vi.mock("./_lib/phoneCode.js", async (importActual) => ({
  ...(await importActual<typeof import("./_lib/phoneCode.js")>()),
  checkSendLimits: async () => ({
    allowed: false,
    reason: "cooldown",
    retryAfter: 60,
  }),
}));

import handler from "./send-phone-code.js";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const CATCH_ALL = "tenant-etc";

let db: FakeDb;

beforeEach(() => {
  db = createFakeDb({
    tables: {
      tenants: [
        { id: TENANT_A, is_catch_all: false },
        { id: TENANT_B, is_catch_all: false },
        { id: CATCH_ALL, is_catch_all: true },
      ],
      profiles: [
        {
          id: "p1",
          phone: "01012345678",
          member_type: "student",
          tenant_id: TENANT_A,
        },
      ],
    },
    rpcs: {
      fn_signup_tenant_lookup: ({ p_code }) =>
        p_code === "AAAA"
          ? [{ id: TENANT_A, name: "A", org_type: "school" }]
          : [],
    },
  });
  state.db = createFakeSupabase(db);
});

const send = (body: Record<string, unknown>) =>
  callHandler(
    handler as never,
    { phone: "010-1234-5678", ...body },
    {
      "x-forwarded-for": "1.1.1.1",
    },
  );

describe("send-phone-code 기관별 중복", () => {
  test("tenant 정보가 없으면(위닝) 전체에서 번호를 본다", async () => {
    const res = await send({ purpose: "signup" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ reason: "phone_taken" });
  });

  test("같은 기관 코드면 중복으로 막는다", async () => {
    const res = await send({ purpose: "signup", tenant_code: "AAAA" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ reason: "phone_taken" });
    expect(db.rpcCalls[0]).toEqual({
      name: "fn_signup_tenant_lookup",
      args: { p_code: "AAAA", p_ip: "1.1.1.1" },
    });
  });

  test("다른 기관에만 있는 번호는 중복이 아니다", async () => {
    db.tables.profiles![0]!.tenant_id = TENANT_B;
    const res = await send({ purpose: "signup", tenant_code: "AAAA" });
    expect(res.status).toBe(429);
  });

  test("모르는 소속코드는 400 tenant_not_found 이고 번호 조회까지 가지 않는다", async () => {
    const res = await send({ purpose: "signup", tenant_code: "ZZZZ" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ reason: "tenant_not_found" });
  });

  test("catch_all 이면 기타 소속 기관 안에서만 중복을 본다", async () => {
    const other = await send({ purpose: "signup", catch_all: true });
    expect(other.status).toBe(429);

    db.tables.profiles![0]!.tenant_id = CATCH_ALL;
    const same = await send({ purpose: "signup", catch_all: true });
    expect(same.status).toBe(409);
  });

  test("클라이언트가 보낸 tenant_id 는 무시한다(전체에서 본다)", async () => {
    const res = await send({ purpose: "signup", tenant_id: TENANT_B });
    expect(res.status).toBe(409);
  });

  test("signup 이 아닌 목적에는 tenant_code 를 조회하지 않는다", async () => {
    const res = await send({ purpose: "find_account", tenant_code: "ZZZZ" });
    expect(res.status).toBe(429);
    expect(db.rpcCalls).toHaveLength(0);
  });

  test("소속코드 시도 한도(WC068)는 429 로 답한다", async () => {
    db.rpcs.fn_signup_tenant_lookup = () => {
      throw { code: "WC068", message: "tenant_code_attempts_exceeded" };
    };
    const res = await send({ purpose: "signup", tenant_code: "AAAA" });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ reason: "tenant_code_attempts_exceeded" });
  });
});
