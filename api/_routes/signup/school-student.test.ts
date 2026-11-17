// POST /api/signup/school-student 계약 검증(스쿨멘토 학생 가입 확정).
//
// 가짜 service_role 클라이언트는 consoleTestKit 것을 쓴다. 토큰이 가리키는 Auth 사용자(이미 이메일 인증을
// 마친 사용자)는 kit.state.user 로 넣고, 가입 확정은 fn_student_signup 가짜로 받는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { callSignup } from "../../_lib/signup/signupTestKit.js";
import handler from "./school-student.js";

const AUTHED = {
  "x-forwarded-for": "9.9.9.9",
  authorization: "Bearer good-token",
};
const post = (body: unknown) => callSignup(handler, body, AUTHED);

const TENANT = { id: "t-1", name: "가나중학교", org_type: "학교" };
const SIGNUP_OK = {
  ok: true,
  id: "auth-user-1",
  email: "gildong@example.com",
  under14: false,
  tenant_id: "t-1",
  tenant_name: "가나중학교",
  link_code: "LINK-1",
};

/** 토큰이 가리키는 Auth 사용자. 기본은 이메일 인증을 마친 학생. */
function authUser(over: Record<string, unknown> = {}) {
  kit.state.user = {
    id: "auth-user-1",
    email: "gildong@example.com",
    email_confirmed_at: "2026-11-17T00:00:00Z",
    ...over,
  } as never;
}

/** 가입이 끝까지 가는 기본 설정. 테스트가 필요한 칸만 덮어쓴다. */
function happyPath() {
  authUser();
  kit.state.rpc.fn_signup_tenant_lookup = () => ({
    data: [TENANT],
    error: null,
  });
  kit.state.rpc.fn_student_signup = () => ({ data: SIGNUP_OK, error: null });
}

const BODY = {
  name: "홍길동",
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
  process.env.SITE = "schoolmentor";
  process.env.SUPABASE_URL = "http://127.0.0.1:54421";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/signup/school-student", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED 이고 가입 확정을 부르지 않는다", async () => {
    happyPath();

    const r = await callSignup(handler, BODY, { "x-forwarded-for": "9.9.9.9" });

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("토큰이 잘못되면 401 UNAUTHENTICATED 이고 가입 확정을 부르지 않는다", async () => {
    happyPath();
    kit.state.user = null;

    const r = await post(BODY);

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("이메일 인증을 마치지 않은 사용자는 403 EMAIL_NOT_VERIFIED 이고 가입 확정을 부르지 않는다", async () => {
    happyPath();
    authUser({ email_confirmed_at: null });

    const r = await post(BODY);

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "이메일 인증을 먼저 완료해 주세요.",
    });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test.each([
    "someone@teacher.schoolmentor.kr",
    "Someone@Teacher.Schoolmentor.kr",
    "login-decoy-00000000@teacher.schoolmentor.kr",
  ])(
    "토큰 이메일이 교사 합성 도메인(%s)이면 400 VALIDATION email 이고 가입 확정을 부르지 않는다",
    async (email) => {
      happyPath();
      authUser({ email });

      const r = await post(BODY);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION", field: "email" });
      expect(kit.state.events).not.toContain("rpc:fn_student_signup");
    },
  );

  test("SITE 가 schoolmentor 가 아니면 404 이고 가입 확정을 부르지 않는다", async () => {
    happyPath();
    delete process.env.SITE;

    const r = await post(BODY);

    expect(r.status).toBe(404);
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("요청 IP 를 알 수 없으면 400 CLIENT_IP_MISSING 이고 가입 확정을 부르지 않는다", async () => {
    happyPath();

    const r = await callSignup(handler, BODY, {
      authorization: "Bearer good-token",
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "CLIENT_IP_MISSING" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test.each([
    ["name", { name: "  " }],
    ["phone", { phone: "02-123-4567" }],
    ["birthDate", { birthDate: "2012/03/04" }],
    ["gender", { gender: "x" }],
    ["tenantCode", { tenantCode: undefined }],
    ["grade", { grade: "" }],
    ["number", { number: 1.5 }],
    ["guardianPhone", { guardianPhone: "123" }],
    ["agreeService", { agreeService: false }],
  ])(
    "%s 가 잘못되면 400 VALIDATION 과 field 를 주고 가입 확정을 부르지 않는다",
    async (field, over) => {
      happyPath();

      const r = await post({ ...BODY, ...over });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION", field });
      expect(kit.state.events).not.toContain("rpc:fn_student_signup");
    },
  );

  test("예전 클라이언트가 보낸 email, username, password 는 무시하고 토큰 이메일로 진행한다", async () => {
    happyPath();
    const signupCalls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_student_signup = (args) => {
      signupCalls.push(args);
      return { data: SIGNUP_OK, error: null };
    };

    const r = await post({
      ...BODY,
      email: "someone@teacher.schoolmentor.kr",
      username: "ab",
      password: "weak",
    });

    expect(r.status).toBe(200);
    expect(signupCalls).toHaveLength(1);
  });

  test("본인 번호가 없는 가입(14세 미만)도 phone, birthDate, gender 없이 형식 검사를 통과한다", async () => {
    happyPath();
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

    expect(r.status).toBe(200);
  });

  test("번호 인증 사전 조회 없이 가입 확정(DB)이 번호 인증을 판정한다", async () => {
    happyPath();

    await post(BODY);

    expect(
      kit.state.reads.some((read) => read.table === "phone_verifications"),
    ).toBe(false);
  });

  test("소속코드는 서버가 다시 조회하고 없으면 404 TENANT_NOT_FOUND 로 가입 확정을 부르지 않는다", async () => {
    happyPath();
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_signup_tenant_lookup = (args) => {
      calls.push(args);
      return { data: [], error: null };
    };

    const r = await post({ ...BODY, tenantId: "client-made-up" });

    expect(calls).toEqual([{ p_code: "SCH001", p_ip: "9.9.9.9" }]);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "TENANT_NOT_FOUND" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("소속코드 오답 초과(WC068)는 429 로 바꾼다", async () => {
    happyPath();
    kit.state.rpc.fn_signup_tenant_lookup = () => ({
      data: null,
      error: { code: "WC068" },
    });

    const r = await post(BODY);

    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "WC068" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("소속이 있는 가입에 반이 없으면 400 CLASS_REQUIRED", async () => {
    happyPath();

    const r = await post({ ...BODY, className: undefined });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "CLASS_REQUIRED" });
    expect(kit.state.events).not.toContain("rpc:fn_student_signup");
  });

  test("성공하면 토큰의 사용자 id 로 가입 확정을 부르고 세션 없이 학급 연결 코드를 돌려준다", async () => {
    happyPath();
    const signupCalls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_student_signup = (args) => {
      signupCalls.push(args);
      return { data: SIGNUP_OK, error: null };
    };

    const r = await post({ ...BODY, tenantId: "client-made-up" });

    expect(signupCalls).toEqual([
      {
        p_user_id: "auth-user-1",
        p_username: null,
        p_name: "홍길동",
        p_email: null,
        p_phone: "01012345678",
        p_birth_date: "2012-03-04",
        p_gender: "남",
        p_tenant_id: "t-1",
        p_grade: "중1",
        p_group_name: null,
        p_class_name: "3",
        p_number: 7,
        p_guardian_name: null,
        p_guardian_phone: null,
        p_guardian_relation: null,
        p_guardian_consent: false,
        p_identity_request_id: null,
        p_agree_service: true,
        p_agree_privacy: true,
        p_agree_db_transfer: true,
        p_agree_marketing: false,
      },
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      linkCode: "LINK-1",
      tenantName: "가나중학교",
    });
  });

  test("가입 확정이 실패해도 Auth 사용자를 만들거나 지우지 않는다", async () => {
    happyPath();
    kit.state.rpc.fn_student_signup = () => ({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await post(BODY);

    expect(r.status).toBe(500);
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
    expect(kit.state.auth.deleteUser).not.toHaveBeenCalled();
  });

  test("기타(tenantCode null)는 조회 없이 소속 없이 가입 확정을 부른다", async () => {
    happyPath();
    const lookup = vi.fn();
    kit.state.rpc.fn_signup_tenant_lookup = lookup;
    const signupCalls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_student_signup = (args) => {
      signupCalls.push(args);
      return { data: SIGNUP_OK, error: null };
    };

    const r = await post({ ...BODY, tenantCode: null, className: undefined });

    expect(lookup).not.toHaveBeenCalled();
    expect(signupCalls[0]).toMatchObject({ p_tenant_id: null });
    expect(r.status).toBe(200);
  });

  test.each([
    [
      "홍길동",
      "NUMBER_TAKEN_SAME_NAME",
      "이미 가입 내역이 있습니다. 재확인해 주세요",
    ],
    [
      "김철수",
      "NUMBER_TAKEN_OTHER",
      "동일한 학년, 반, 번호의 학생이 이미 존재합니다. 학년, 반, 번호를 다시 확인해 주세요",
    ],
  ])(
    "번호 중복(WC077)은 점유자 이름(%s)과 신청자 이름을 비교해 %s 로 나누고 이름을 응답에 싣지 않는다",
    async (holder, code, message) => {
      happyPath();
      kit.state.rpc.fn_student_signup = () => ({
        data: null,
        error: { code: "WC077", message: "number_taken", details: holder },
      });

      const r = await post({ ...BODY, name: " 홍길동 " });

      expect(r.status).toBe(409);
      expect(r.body).toEqual({ code, message });
    },
  );

  test.each([
    ["WC074", "signup_disabled", 403, "SIGNUP_CLOSED", undefined],
    ["WC096", "phone_taken", 409, "PHONE_TAKEN", undefined],
    ["WC097", "tenant_not_found", 404, "TENANT_NOT_FOUND", undefined],
    ["WC080", "group_not_registered", 400, "WC080", undefined],
    ["P0001", "duplicate_email", 409, "EMAIL_TAKEN", undefined],
    ["P0001", "already_signed_up", 409, "ALREADY_SIGNED_UP", undefined],
    ["P0001", "email_not_verified", 403, "EMAIL_NOT_VERIFIED", undefined],
    ["P0001", "phone_not_verified", 400, "PHONE_NOT_VERIFIED", undefined],
    [
      "P0001",
      "guardian_phone_not_verified",
      400,
      "GUARDIAN_PHONE_NOT_VERIFIED",
      undefined,
    ],
    ["P0001", "identity_not_verified", 400, "IDENTITY_REQUIRED", undefined],
    ["P0001", "identity_purpose_mismatch", 400, "IDENTITY_REQUIRED", undefined],
    ["P0001", "guardian_age", 400, "IDENTITY_REQUIRED", undefined],
    ["P0001", "birth_date_required", 400, "VALIDATION", "birthDate"],
    [
      "P0001",
      "guardian_consent_required",
      400,
      "VALIDATION",
      "guardianConsent",
    ],
  ])(
    "%s %s 는 %i %s 로 바꾼다",
    async (sqlstate, message, status, code, field) => {
      happyPath();
      kit.state.rpc.fn_student_signup = () => ({
        data: null,
        error: { code: sqlstate, message },
      });

      const r = await post(BODY);

      expect(r.status).toBe(status);
      expect(r.body).toMatchObject({ code });
      expect((r.body as { message: string }).message).toEqual(
        expect.any(String),
      );
      if (field) expect(r.body).toMatchObject({ field });
    },
  );

  test.each([
    ["WC095", "username_taken"],
    ["P0001", "username_invalid"],
  ])(
    "더는 쓰지 않는 아이디 오류(%s %s)는 매핑하지 않고 500 으로 던진다",
    async (sqlstate, message) => {
      happyPath();
      kit.state.rpc.fn_student_signup = () => ({
        data: null,
        error: { code: sqlstate, message },
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const r = await post(BODY);

      expect(r.status).toBe(500);
    },
  );

  test.each([
    ["40P01", "deadlock detected"],
    ["55P03", "could not obtain lock"],
    ["57014", "canceling statement due to statement timeout"],
  ])(
    "교착이나 대기 시간 초과(%s)는 409 TRY_AGAIN 으로 바꾼다",
    async (sqlstate, message) => {
      happyPath();
      kit.state.rpc.fn_student_signup = () => ({
        data: null,
        error: { code: sqlstate, message },
      });

      const r = await post(BODY);

      expect(r.status).toBe(409);
      expect(r.body).toEqual({
        code: "TRY_AGAIN",
        message: "잠시 뒤 다시 시도해 주세요.",
      });
    },
  );

  test("가입 결과를 개인정보 없이 한 줄 로그로 남긴다", async () => {
    happyPath();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await post({ ...BODY, guardianPhone: "010-9999-0000" });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("[signup/school-student]");
    expect(line).toContain("outcome=created");
    expect(line).toContain("user=auth-user-1");
    expect(line).toContain("tenant=t-1");
    for (const pii of ["홍길동", "gildong", "1234", "9999", "2012"]) {
      expect(line).not.toContain(pii);
    }
  });

  test("거절도 개인정보 없이 한 줄 로그로 남긴다", async () => {
    happyPath();
    kit.state.rpc.fn_student_signup = () => ({
      data: null,
      error: { code: "P0001", message: "already_signed_up" },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const r = await post(BODY);

    expect(r.status).toBe(409);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    expect(line).toContain("outcome=rejected");
    expect(line).toContain("code=ALREADY_SIGNED_UP");
    expect(line).toContain("user=auth-user-1");
    for (const pii of ["홍길동", "gildong", "1234"]) {
      expect(line).not.toContain(pii);
    }
  });
});
