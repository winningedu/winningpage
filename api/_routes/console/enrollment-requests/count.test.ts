// GET /api/console/enrollment-requests/count 계약 검증. W13 배지는 범위 안의 열린 신청 수다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  actor: {} as Record<string, unknown>,
  changes: [] as Row[],
  countError: null as unknown,
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
    rpc: () => Promise.resolve({ data: [state.actor], error: null }),
    from: (table: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push((r) => String(r[col]) === String(val));
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({ data: { login_id: "SM123456" }, error: null }),
        // biome-ignore lint/suspicious/noThenProperty: postgrest 쿼리 빌더는 await 가능한 객체다.
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            count:
              table === "enrollment_changes"
                ? state.changes.filter((r) => filters.every((f) => f(r))).length
                : null,
            error: state.countError,
          }),
        insert: (row: Row) => {
          state.inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
      return chain;
    },
  }),
}));

import handler from "./count.js";

async function get(): Promise<{ status: number; body: unknown }> {
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
      method: "GET",
      headers: { authorization: "Bearer token" },
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const BASE_ACTOR = {
  tenant_id: "tenant-1",
  teacher_id: "teacher-1",
  proxy_session_id: null,
  must_change_password: false,
};

beforeEach(() => {
  state.changes = [
    { tenant_id: "tenant-1", status: "pending", to_class_id: "class-A" },
    { tenant_id: "tenant-1", status: "pending", to_class_id: "class-A" },
    { tenant_id: "tenant-1", status: "pending", to_class_id: "class-Z" },
    { tenant_id: "tenant-1", status: "pending", to_class_id: null },
    { tenant_id: "tenant-1", status: "applied", to_class_id: "class-A" },
    { tenant_id: "tenant-2", status: "pending", to_class_id: "class-A" },
  ];
  state.countError = null;
  state.inserts = [];
});

describe("GET /api/console/enrollment-requests/count", () => {
  test("homeroom counts only pending requests into own classes", async () => {
    state.actor = { ...BASE_ACTOR, kind: "homeroom", class_ids: ["class-A"] };
    expect(await get()).toEqual({ status: 200, body: { count: 2 } });
  });

  test("school admin counts every pending request in the tenant and nothing from other tenants", async () => {
    state.actor = { ...BASE_ACTOR, kind: "school_admin", class_ids: [] };
    expect(await get()).toEqual({ status: 200, body: { count: 4 } });
  });

  test("a failed count is a 500, and a read of the badge writes no audit row", async () => {
    state.actor = { ...BASE_ACTOR, kind: "school_admin", class_ids: [] };
    state.countError = { message: "boom" };
    expect((await get()).status).toBe(500);
    expect(state.inserts).toEqual([]);
  });
});
