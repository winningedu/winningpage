// POST /api/enrollment/self-assign 계약 검증.
// fn_enrollment_join 은 service_role 전용이라 서버가 학생 id(토큰)와 기관(프로필)을 직접 정해 넘긴다. 본문의 id 는 쓰지 않는다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  profileTenant: "tenant-1" as string | null,
  joinResult: {
    data: [{ enrollment_id: "enr-1", class_id: "class-1", version: 2 }],
    error: null,
  } as { data: unknown; error: unknown },
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  profileFilters: [] as [string, unknown][],
  catchAll: false,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "student-1" } },
        error: null,
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return Promise.resolve(state.joinResult);
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          state.profileFilters.push([col, val]);
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "tenants"
                ? {
                    school_year: 2026,
                    org_type: "학교",
                    is_catch_all: state.catchAll,
                  }
                : state.profileTenant
                  ? { tenant_id: state.profileTenant }
                  : { tenant_id: null },
            error: null,
          }),
      };
      return chain;
    },
  }),
}));

import handler from "./self-assign.js";

async function post(body: unknown) {
  const captured = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer student-token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const BODY = { grade: "고2", groupName: "A그룹", className: "3", number: 12 };

beforeEach(() => {
  state.profileTenant = "tenant-1";
  state.joinResult = {
    data: [{ enrollment_id: "enr-1", class_id: "class-1", version: 2 }],
    error: null,
  };
  state.rpcCalls = [];
  state.profileFilters = [];
  state.catchAll = false;
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/enrollment/self-assign", () => {
  test("스쿨멘토에서 기타 소속은 서버가 거절하고 RPC 를 부르지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    state.catchAll = true;
    const result = await post(BODY);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(state.rpcCalls).toHaveLength(0);
  });

  test("위닝은 기타 소속 표시가 있어도 거절하지 않고 가입시킨다", async () => {
    vi.stubEnv("SITE", "winning");
    state.catchAll = true;
    const result = await post(BODY);
    expect(result.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
  });

  test("joins as the token's student in the profile's tenant, ignoring ids in the body", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const result = await post({ ...BODY, studentId: "x", tenantId: "other" });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, enrollmentId: "enr-1", classId: "class-1", version: 2 },
    });
    // 프로필(토큰의 학생)에서 기관을 정한 뒤 그 기관만 읽는다. 본문의 tenantId 는 어디에도 쓰지 않는다.
    expect(state.profileFilters).toEqual([
      ["id", "student-1"],
      ["id", "tenant-1"],
    ]);
    expect(state.rpcCalls).toEqual([
      {
        name: "fn_enrollment_join",
        args: {
          p_student: "student-1",
          p_tenant: "tenant-1",
          p_grade: "고2",
          p_group_name: "A그룹",
          p_class_name: "3",
          p_number: 12,
        },
      },
    ]);
  });

  test("a student without an institution gets 404 and no RPC call", async () => {
    state.profileTenant = null;
    expect(await post(BODY)).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } },
    });
    expect(state.rpcCalls).toEqual([]);
  });

  test.each([
    ["WC079", 409, "ALREADY_ASSIGNED"],
    ["WC077", 409, "NUMBER_TAKEN"],
    ["WC080", 400, "GROUP_NOT_REGISTERED"],
  ])("%s maps to %i %s", async (pgCode, status, code) => {
    state.joinResult = { data: null, error: { code: pgCode } };
    expect(await post(BODY)).toMatchObject({
      status,
      body: { error: { code } },
    });
  });

  test("an unknown RPC failure is 500", async () => {
    state.joinResult = { data: null, error: { code: "XX000" } };
    expect((await post(BODY)).status).toBe(500);
  });

  test.each([
    ["no grade", { className: "3" }],
    ["no class name", { grade: "고2" }],
    ["unknown grade", { ...BODY, grade: "고4" }],
    ["number out of range", { ...BODY, number: 100 }],
  ])("%s is a 400 before any lookup", async (_name, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(state.rpcCalls).toEqual([]);
  });
});
