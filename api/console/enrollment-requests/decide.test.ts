// POST /api/console/enrollment-requests/decide 계약 검증.
// 승인자 판정(도착 학급 담임, 없으면 학교 관리자나 대행)은 fn_decide_enrollment_change 가 한다. 여기서는 위임과 매핑, 로그를 본다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  changes: [] as Row[],
  decideResult: { data: "applied", error: null } as {
    data: unknown;
    error: unknown;
  },
  logError: null as unknown,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  inserts: [] as { table: string; row: Row }[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "t@example.com" } },
        error: null,
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "fn_console_actor") {
        return Promise.resolve({ data: [state.actor], error: null });
      }
      if (name === "fn_decide_enrollment_change") {
        return Promise.resolve(state.decideResult);
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push((r) => String(r[col]) === String(val));
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "enrollment_changes"
                ? (state.changes.find((r) => filters.every((f) => f(r))) ??
                  null)
                : table === "teachers"
                  ? { login_id: "SM123456" }
                  : null,
            error: null,
          }),
        insert: (row: Row) => {
          state.inserts.push({ table, row });
          return Promise.resolve({ error: state.logError });
        },
      };
      return chain;
    },
  }),
}));

import handler from "./decide.js";

type Captured = { status: number; body: unknown };

async function post(body: unknown): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined };
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
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const HOMEROOM = {
  kind: "homeroom",
  tenant_id: "tenant-1",
  teacher_id: "teacher-1",
  class_ids: ["class-A"],
  proxy_session_id: null,
  must_change_password: false,
};

function decideCall() {
  return state.rpcCalls.find((c) => c.name === "fn_decide_enrollment_change");
}

beforeEach(() => {
  state.actor = HOMEROOM;
  state.changes = [
    { id: "chg-1", tenant_id: "tenant-1", student_id: "student-1" },
    { id: "chg-other", tenant_id: "tenant-2", student_id: "student-9" },
  ];
  state.decideResult = { data: "applied", error: null };
  state.logError = null;
  state.rpcCalls = [];
  state.inserts = [];
});

describe("POST /api/console/enrollment-requests/decide", () => {
  test("approve calls the RPC with the signed-in actor and logs the decision", async () => {
    const result = await post({ changeId: "chg-1", approve: true });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, status: "applied" },
    });
    expect(decideCall()?.args).toEqual({
      p_change_id: "chg-1",
      p_approve: true,
      p_reject_reason: null,
      p_actor: "user-1",
    });
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "enrollmentRequest",
      target_id: "chg-1",
      tenant_id: "tenant-1",
      teacher_id: "teacher-1",
      meta: { decision: "applied", studentId: "student-1" },
    });
  });

  test("reject passes the reason through and logs it", async () => {
    state.decideResult = { data: "rejected", error: null };

    const result = await post({
      changeId: "chg-1",
      approve: false,
      rejectReason: "번호가 맞지 않아요",
    });

    expect(result.body).toEqual({ ok: true, status: "rejected" });
    expect(decideCall()?.args.p_reject_reason).toBe("번호가 맞지 않아요");
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({ reason: "번호가 맞지 않아요" });
  });

  test("a request of another tenant or a missing one is 404 without calling the RPC", async () => {
    for (const changeId of ["chg-other", "ghost"]) {
      const result = await post({ changeId, approve: true });
      expect(result).toMatchObject({
        status: 404,
        body: { error: { code: "REQUEST_NOT_FOUND" } },
      });
    }
    expect(decideCall()).toBeUndefined();
    expect(state.inserts).toEqual([]);
  });

  test.each([
    ["WC084", 403, "NOT_APPROVER"],
    ["WC083", 404, "REQUEST_NOT_FOUND"],
    ["WC078", 409, "VERSION_CONFLICT"],
    ["WC077", 409, "NUMBER_TAKEN"],
    ["WC085", 400, "REJECT_REASON_REQUIRED"],
  ])("%s maps to %i %s and nothing is logged", async (pgCode, status, code) => {
    state.decideResult = { data: null, error: { code: pgCode } };

    const result = await post({ changeId: "chg-1", approve: false });

    expect(result).toMatchObject({ status, body: { error: { code } } });
    expect(state.inserts).toEqual([]);
  });

  test.each([
    ["no change id", { approve: true }],
    ["approve not boolean", { changeId: "chg-1", approve: "yes" }],
    [
      "reason not a string",
      { changeId: "chg-1", approve: false, rejectReason: 3 },
    ],
  ])("%s is a 400", async (_name, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(decideCall()).toBeUndefined();
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await post({ changeId: "chg-1", approve: true })).status).toBe(500);
  });
});
