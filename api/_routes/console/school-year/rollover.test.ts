// POST /api/console/school-year/rollover 계약 검증. 학교 관리자(대행 포함)만, 기관은 행위자에서 정한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  result: {
    data: [
      {
        graduated_count: 5,
        promoted_count: 20,
        skipped_count: 1,
        assigned_count: 18,
      },
    ],
    error: null,
  } as { data: unknown; error: unknown },
  logError: null as unknown,
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  inserts: [] as { table: string; row: Row }[],
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
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
      return Promise.resolve(state.result);
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { login_id: "SM123456" }, error: null }),
        insert: (row: Row) => {
          state.inserts.push({ table, row });
          return Promise.resolve({ error: state.logError });
        },
      };
      return chain;
    },
  }),
}));

import handler from "./rollover.js";

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
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const SCHOOL_ADMIN = {
  kind: "school_admin",
  tenant_id: "tenant-1",
  teacher_id: "teacher-9",
  class_ids: [],
  proxy_session_id: null,
  must_change_password: false,
};

function rolloverCall() {
  return state.rpcCalls.find((c) => c.name === "fn_school_year_rollover");
}

beforeEach(() => {
  state.actor = SCHOOL_ADMIN;
  state.result = {
    data: [
      {
        graduated_count: 5,
        promoted_count: 20,
        skipped_count: 1,
        assigned_count: 18,
      },
    ],
    error: null,
  };
  state.logError = null;
  state.rpcCalls = [];
  state.inserts = [];
});

describe("POST /api/console/school-year/rollover", () => {
  test("rolls over the actor's tenant with snake_case rows and logs the counts", async () => {
    const result = await post({
      toYear: 2027,
      rows: [
        { studentId: "s-1", groupId: "g-1", className: "3", number: 4 },
        { studentId: "s-2", className: "5" },
      ],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        graduated: 5,
        promoted: 20,
        skipped: 1,
        assigned: 18,
      },
    });
    expect(rolloverCall()?.args).toEqual({
      p_tenant: "tenant-1",
      p_to_year: 2027,
      p_rows: [
        { student_id: "s-1", group_id: "g-1", class_name: "3", number: 4 },
        { student_id: "s-2", group_id: null, class_name: "5", number: null },
      ],
      p_actor: "user-1",
    });
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "schoolYear",
      tenant_id: "tenant-1",
      meta: {
        toYear: 2027,
        graduated: 5,
        promoted: 20,
        skipped: 1,
        assigned: 18,
      },
    });
  });

  test("a homeroom teacher is refused by the handler (403) and nothing runs", async () => {
    state.actor = { ...SCHOOL_ADMIN, kind: "homeroom", class_ids: ["c-1"] };
    expect(await post({ toYear: 2027 })).toMatchObject({
      status: 403,
      body: { error: { code: "NOT_SCHOOL_ADMIN" } },
    });
    expect(rolloverCall()).toBeUndefined();
  });

  test("a second run that changed nothing still answers 200 with zero counts and is logged", async () => {
    state.result = {
      data: [
        {
          graduated_count: 0,
          promoted_count: 0,
          skipped_count: 0,
          assigned_count: 0,
        },
      ],
      error: null,
    };
    const result = await post({ toYear: 2027 });
    expect(result).toMatchObject({ status: 200, body: { promoted: 0 } });
    expect(rolloverCall()?.args.p_rows).toEqual([]);
  });

  test("number taken is 409 and nothing is logged", async () => {
    state.result = { data: null, error: { code: "WC077" } };
    expect(await post({ toYear: 2027 })).toMatchObject({
      status: 409,
      body: { error: { code: "NUMBER_TAKEN" } },
    });
    expect(state.inserts).toEqual([]);
  });

  test.each([
    ["no year", {}],
    ["year not an integer", { toYear: "2027" }],
    ["rows not an array", { toYear: 2027, rows: "x" }],
    ["row without student", { toYear: 2027, rows: [{ className: "3" }] }],
    [
      "row number out of range",
      { toYear: 2027, rows: [{ studentId: "s", className: "3", number: 0 }] },
    ],
  ])("%s is a 400", async (_name, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
    expect(rolloverCall()).toBeUndefined();
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await post({ toYear: 2027 })).status).toBe(500);
  });
});
