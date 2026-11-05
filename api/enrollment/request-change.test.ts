// POST /api/enrollment/request-change 계약 검증.
// 학생 본인 토큰으로 만든 클라이언트로 fn_request_enrollment_change 를 불러 auth.uid() 가 학생이 되게 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: { data: "chg-1", error: null } as { data: unknown; error: unknown },
  userRpc: [] as { name: string; args: Record<string, unknown> }[],
  adminRpc: [] as string[],
  tokens: [] as string[],
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "student-1" } },
        error: null,
      }),
    },
    rpc: (name: string) => {
      state.adminRpc.push(name);
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

vi.mock("../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    state.tokens.push(token);
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.userRpc.push({ name, args });
        return Promise.resolve(state.result);
      },
    };
  },
}));

import handler from "./request-change.js";

async function post(body: unknown, authorization = "Bearer student-token") {
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
      headers: { authorization },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const BODY = { grade: "고2", groupName: "A그룹", className: "3", number: 12 };

beforeEach(() => {
  state.result = { data: "chg-1", error: null };
  state.userRpc = [];
  state.adminRpc = [];
  state.tokens = [];
});

describe("POST /api/enrollment/request-change", () => {
  test("calls the request RPC as the student with the student's own token only", async () => {
    const result = await post(BODY);

    expect(result).toEqual({
      status: 200,
      body: { ok: true, changeId: "chg-1" },
    });
    expect(state.tokens).toEqual(["student-token"]);
    expect(state.userRpc).toEqual([
      {
        name: "fn_request_enrollment_change",
        args: {
          p_to_grade: "고2",
          p_to_group_name: "A그룹",
          p_to_class_name: "3",
          p_to_number: 12,
        },
      },
    ]);
    expect(state.adminRpc).toEqual([]);
  });

  test("omitted fields go as null and a student id in the body is ignored", async () => {
    await post({ className: "3", studentId: "someone-else" });

    expect(state.userRpc[0]?.args).toEqual({
      p_to_grade: null,
      p_to_group_name: null,
      p_to_class_name: "3",
      p_to_number: null,
    });
  });

  test.each([
    ["WC082", 409, "REQUEST_PENDING"],
    ["WC081", 404, "NOT_FOUND"],
    ["WC080", 400, "GROUP_NOT_REGISTERED"],
    ["23503", 400, "INVALID_CLASS"],
  ])("%s maps to %i %s", async (pgCode, status, code) => {
    state.result = { data: null, error: { code: pgCode } };
    expect(await post(BODY)).toMatchObject({
      status,
      body: { error: { code } },
    });
  });

  test("an unknown RPC failure is 500", async () => {
    state.result = { data: null, error: { code: "XX000" } };
    expect((await post(BODY)).status).toBe(500);
  });

  test.each([
    ["nothing to change", {}],
    ["unknown grade", { grade: "고4" }],
    ["number out of range", { number: 0 }],
    ["class name not a string", { className: 3 }],
  ])("%s is a 400 before the RPC", async (_name, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(state.userRpc).toEqual([]);
  });
});
