// POST /api/console/groups 계약 검증. 그룹 만들기는 학교 관리자만, 기관은 행위자에서 정한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  insertError: null as unknown,
  logError: null as unknown,
  inserts: [] as { table: string; row: Row }[],
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "t@example.com" } },
        error: null,
      }),
    },
    rpc: () => Promise.resolve({ data: [state.actor], error: null }),
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { login_id: "SM123456" }, error: null }),
        insert: (row: Row) => {
          state.inserts.push({ table, row });
          const failure =
            table === "class_groups" ? state.insertError : state.logError;
          const tail = {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: failure ? null : { id: "group-1", name: row.name },
                  error: failure,
                }),
            }),
            // admin_access_logs 는 select 없이 바로 await 한다.
            // biome-ignore lint/suspicious/noThenProperty: postgrest 쿼리 빌더는 await 가능한 객체다.
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ error: failure }),
          };
          return tail;
        },
      };
      return chain;
    },
  }),
}));

import handler from "./groups.js";

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

const groupInsert = () =>
  state.inserts.find((i) => i.table === "class_groups")?.row;

beforeEach(() => {
  state.actor = SCHOOL_ADMIN;
  state.insertError = null;
  state.logError = null;
  state.inserts = [];
});

describe("POST /api/console/groups", () => {
  test("creates a group in the actor's tenant with a trimmed name and logs it", async () => {
    const result = await post({ name: "  A그룹 ", tenantId: "other" });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, groupId: "group-1" },
    });
    expect(groupInsert()).toEqual({ tenant_id: "tenant-1", name: "A그룹" });
    expect(
      state.inserts.find((i) => i.table === "admin_access_logs")?.row,
    ).toMatchObject({
      action: "update",
      resource_key: "classGroup",
      target_id: "group-1",
      tenant_id: "tenant-1",
      meta: { op: "create", name: "A그룹" },
    });
  });

  test("a homeroom teacher is refused (403) and nothing is inserted", async () => {
    state.actor = { ...SCHOOL_ADMIN, kind: "homeroom", class_ids: ["c-1"] };
    expect((await post({ name: "A그룹" })).status).toBe(403);
    expect(state.inserts).toEqual([]);
  });

  test("a duplicate name is 409 GROUP_EXISTS and not logged", async () => {
    state.insertError = { code: "23505" };
    expect(await post({ name: "A그룹" })).toMatchObject({
      status: 409,
      body: {
        error: { code: "GROUP_EXISTS", message: "이미 있는 그룹 이름이에요." },
      },
    });
    expect(state.inserts.map((i) => i.table)).toEqual(["class_groups"]);
  });

  test.each([
    ["missing", {}],
    ["blank", { name: "   " }],
    ["not a string", { name: 3 }],
  ])("a %s name is a 400", async (_n, body) => {
    expect(await post(body)).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "BAD_REQUEST",
          message: "그룹 이름을 입력해 주세요.",
        },
      },
    });
    expect(state.inserts).toEqual([]);
  });

  test("a failed audit write fails the request (500)", async () => {
    state.logError = { message: "db down" };
    expect((await post({ name: "A그룹" })).status).toBe(500);
  });
});
