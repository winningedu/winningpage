// POST /api/console/groups/delete 계약 검증. 다른 기관의 그룹 id 는 404, 재학생이 있으면 409.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  groups: [] as Row[],
  deleteResult: { data: null, error: null } as {
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
      return Promise.resolve(state.deleteResult);
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
              table === "class_groups"
                ? (state.groups.find((r) => filters.every((f) => f(r))) ?? null)
                : { login_id: "SM123456" },
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

import handler from "./delete.js";

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

const deleteCall = () =>
  state.rpcCalls.find((c) => c.name === "fn_group_soft_delete");

beforeEach(() => {
  state.actor = SCHOOL_ADMIN;
  state.groups = [
    { id: "group-1", tenant_id: "tenant-1", name: "A그룹" },
    { id: "group-x", tenant_id: "tenant-2", name: "X그룹" },
  ];
  state.deleteResult = { data: null, error: null };
  state.logError = null;
  state.rpcCalls = [];
  state.inserts = [];
});

describe("POST /api/console/groups/delete", () => {
  test("soft-deletes a group of the tenant and logs it", async () => {
    expect(await post({ groupId: "group-1" })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(deleteCall()?.args).toEqual({
      p_group: "group-1",
      p_actor: "user-1",
      p_tenant: "tenant-1",
    });
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "classGroup",
      target_id: "group-1",
      tenant_id: "tenant-1",
      meta: { op: "delete", name: "A그룹" },
    });
  });

  test("a group of another tenant or a missing one is 404 without calling the RPC", async () => {
    for (const groupId of ["group-x", "ghost"]) {
      expect(await post({ groupId })).toMatchObject({
        status: 404,
        body: { error: { code: "NOT_FOUND" } },
      });
    }
    expect(deleteCall()).toBeUndefined();
    expect(state.inserts).toEqual([]);
  });

  test("a group with active students is 409 and not logged", async () => {
    state.deleteResult = { data: null, error: { code: "WC086" } };
    expect(await post({ groupId: "group-1" })).toMatchObject({
      status: 409,
      body: { error: { code: "GROUP_HAS_STUDENTS" } },
    });
    expect(state.inserts).toEqual([]);
  });

  test("a homeroom teacher is refused (403)", async () => {
    state.actor = { ...SCHOOL_ADMIN, kind: "homeroom", class_ids: ["c-1"] };
    expect((await post({ groupId: "group-1" })).status).toBe(403);
    expect(deleteCall()).toBeUndefined();
  });

  test("a missing group id is a 400", async () => {
    expect(await post({})).toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } },
    });
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await post({ groupId: "group-1" })).status).toBe(500);
  });
});
