// POST /api/signup/school-student 계약 검증(스쿨멘토 학생 가입 확정).
//
// 가짜 service_role 클라이언트는 consoleTestKit 것을 쓰고, GoTrue 비밀번호 로그인은
// @supabase/supabase-js 의 createClient 모킹으로 바꿔 끼운다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  signIn: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: kit.signIn } }),
}));

import { callSignup } from "../_lib/signup/signupTestKit.js";
import handler from "./school-student.js";

const post = (body: unknown) => callSignup(handler, body);

const BODY = {
  username: "student01",
  password: "Pass#123",
  name: "홍길동",
  email: "gildong@example.com",
  phone: "010-1234-5678",
  birthDate: "2012-03-04",
  gender: "남",
  tenantCode: "SCH001",
  grade: "중1",
  className: "3",
  number: 7,
  guardianConsent: false,
  agreeService: true,
  agreePrivacy: true,
  agreeDbTransfer: true,
  agreeMarketing: false,
};

beforeEach(() => {
  kit.state = createKitState();
  kit.signIn = vi.fn();
  process.env.SITE = "schoolmentor";
  process.env.SUPABASE_URL = "http://127.0.0.1:54421";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/signup/school-student", () => {
  test("SITE 가 schoolmentor 가 아니면 404 이고 계정을 만들지 않는다", async () => {
    delete process.env.SITE;

    const r = await post(BODY);

    expect(r.status).toBe(404);
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test.each([
    ["username", { username: "ab" }],
    ["password", { password: "abcdef" }],
    ["name", { name: "  " }],
    ["email", { email: "not-an-email" }],
    ["phone", { phone: "02-123-4567" }],
    ["birthDate", { birthDate: "2012/03/04" }],
    ["gender", { gender: "x" }],
    ["tenantCode", { tenantCode: undefined }],
    ["grade", { grade: "" }],
    ["number", { number: 1.5 }],
    ["guardianPhone", { guardianPhone: "123" }],
    ["agreeService", { agreeService: false }],
  ])(
    "%s 가 잘못되면 400 VALIDATION 과 field 를 주고 계정을 만들지 않는다",
    async (field, over) => {
      const r = await post({ ...BODY, ...over });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION", field });
      expect(kit.state.auth.createUser).not.toHaveBeenCalled();
    },
  );

  test("14세 미만 본인확인 가입은 phone, birthDate, gender 없이도 형식 검사를 통과한다", async () => {
    const { phone, birthDate, gender, ...rest } = BODY;
    void phone;
    void birthDate;
    void gender;

    const r = await post({
      ...rest,
      guardianPhone: "010-9999-0000",
      guardianConsent: true,
      identityRequestId: "req-1",
    });

    expect(r.status).not.toBe(400);
  });

  test("소속코드는 서버가 다시 조회하고 없으면 404 TENANT_NOT_FOUND 로 계정을 만들지 않는다", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_signup_tenant_lookup = (args) => {
      calls.push(args);
      return { data: [], error: null };
    };

    const r = await post({ ...BODY, tenantId: "client-made-up" });

    expect(calls).toEqual([{ p_code: "SCH001", p_ip: "9.9.9.9" }]);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "TENANT_NOT_FOUND" });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test("소속코드 오답 초과(WC068)는 429 로 바꾼다", async () => {
    kit.state.rpc.fn_signup_tenant_lookup = () => ({
      data: null,
      error: { code: "WC068" },
    });

    const r = await post(BODY);

    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "WC068" });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test("소속이 있는 가입에 반이 없으면 400 CLASS_REQUIRED", async () => {
    kit.state.rpc.fn_signup_tenant_lookup = () => ({
      data: [{ id: "t-1", name: "가나중학교", org_type: "학교" }],
      error: null,
    });

    const r = await post({ ...BODY, className: undefined });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "CLASS_REQUIRED" });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });
});
