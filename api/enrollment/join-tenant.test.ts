// POST /api/enrollment/join-tenant 계약 검증(기타 소속 학생이 소속코드로 기관을 옮긴다, 결정 96, 98).
// 학생 id 는 토큰에서만 정한다. 반은 필수, 번호는 선택(1~99)이다(98.10). 이동은 DB 함수 한 번의 트랜잭션이다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./join-tenant.js";

const post = (body: unknown) => callHandler(handler, body);

const BODY = {
  code: " abc23456 ",
  grade: "고2",
  groupName: "A그룹",
  className: "3",
  number: 12,
};

const JOINED = {
  data: [{ tenant_id: "t-1", tenant_name: "가나학원", enrollment_id: "e-1" }],
  error: null,
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "student-1", email: "s@example.com" };
  kit.state.rpc.fn_catch_all_join_tenant = () => JOINED;
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
});

describe("POST /api/enrollment/join-tenant", () => {
  test("moves the token's student with the trimmed code and enrollment fields, ignoring ids in the body", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_catch_all_join_tenant = (args) => {
      calls.push(args);
      return JOINED;
    };

    const r = await post({ ...BODY, userId: "other", tenantId: "other" });

    expect(calls).toEqual([
      {
        p_user: "student-1",
        p_code: "abc23456",
        p_grade: "고2",
        p_group_name: "A그룹",
        p_class_name: "3",
        p_number: 12,
      },
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      tenantId: "t-1",
      tenantName: "가나학원",
      enrollmentId: "e-1",
    });
  });

  test("number and group are optional and go to the DB as null", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_catch_all_join_tenant = (args) => {
      calls.push(args);
      return JOINED;
    };

    const r = await post({ code: "ABC23456", grade: "고1", className: "7" });

    expect(r.status).toBe(200);
    expect(calls[0]).toMatchObject({ p_group_name: null, p_number: null });
  });

  test.each([
    ["no class name", { ...BODY, className: undefined }, "CLASS_REQUIRED"],
    ["blank class name", { ...BODY, className: "  " }, "CLASS_REQUIRED"],
    ["no code", { ...BODY, code: " " }, "BAD_REQUEST"],
    ["unknown grade", { ...BODY, grade: "고4" }, "BAD_REQUEST"],
    ["number 0", { ...BODY, number: 0 }, "BAD_REQUEST"],
    ["number 100", { ...BODY, number: 100 }, "BAD_REQUEST"],
    ["number as text", { ...BODY, number: "12" }, "BAD_REQUEST"],
  ])("%s is a 400 before any DB call", async (_name, body, code) => {
    const join = vi.fn();
    kit.state.rpc.fn_catch_all_join_tenant = join;

    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code } },
    });
    expect(join).not.toHaveBeenCalled();
  });

  test("a code that matches no institution is 404 TENANT_NOT_FOUND", async () => {
    kit.state.rpc.fn_catch_all_join_tenant = () => ({ data: [], error: null });

    expect(await post(BODY)).toMatchObject({
      status: 404,
      body: { error: { code: "TENANT_NOT_FOUND" } },
    });
  });

  test.each([
    ["WC098", 403, "NOT_CATCH_ALL"],
    ["WC068", 429, "TOO_MANY_ATTEMPTS"],
    ["WC096", 409, "PHONE_TAKEN"],
    ["WC080", 400, "GROUP_NOT_REGISTERED"],
    ["WC079", 409, "ALREADY_ASSIGNED"],
    ["WC094", 403, "NOT_STUDENT"],
    ["WC103", 403, "QA_ACCOUNT_RESTRICTED"],
  ])("%s maps to %i %s with a Korean message", async (pgCode, status, code) => {
    kit.state.rpc.fn_catch_all_join_tenant = () => ({
      data: null,
      error: { code: pgCode, details: "홍길동" },
    });

    const r = await post(BODY);

    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ error: { code } });
    const message = (r.body as { error: { message: string } }).error.message;
    expect(message).toMatch(/요\.$/);
    // 번호를 쓰는 다른 학생의 이름은 응답에 싣지 않는다.
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
  });

  test.each([
    ["홍길동", "NUMBER_TAKEN_SAME_NAME", "이미 가입 내역이 있습니다"],
    ["김철수", "NUMBER_TAKEN_OTHER", "동일한 학년, 반, 번호의 학생이"],
  ])(
    "WC077 holder %s maps to 409 %s with the signup message",
    async (holder, code, messagePart) => {
      kit.state.rows.profiles = () => ({ name: "홍길동" });
      kit.state.rpc.fn_catch_all_join_tenant = () => ({
        data: null,
        error: { code: "WC077", details: holder },
      });

      const r = await post(BODY);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code } });
      const message = (r.body as { error: { message: string } }).error.message;
      expect(message).toContain(messagePart);
      // 번호를 쓰는 학생의 이름은 응답에 싣지 않는다.
      expect(JSON.stringify(r.body)).not.toContain("김철수");
    },
  );

  test("an unknown RPC failure is 500", async () => {
    kit.state.rpc.fn_catch_all_join_tenant = () => ({
      data: null,
      error: { code: "XX000" },
    });
    expect((await post(BODY)).status).toBe(500);
  });

  test("outside Schoolmentor it is 404 and nothing is moved", async () => {
    delete process.env.SITE;
    const join = vi.fn();
    kit.state.rpc.fn_catch_all_join_tenant = join;

    expect((await post(BODY)).status).toBe(404);
    expect(join).not.toHaveBeenCalled();
  });
});
