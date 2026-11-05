// POST /api/console/proxy/end 계약 검증. 관리자 클라이언트는 createSupabaseAdmin 모킹으로 바꿔 끼운다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: [] as { resource_key: string; level: string }[],
  endResult: { data: "session-1", error: null } as {
    data: unknown;
    error: unknown;
  },
  session: { tenant_id: "tenant-1" } as { tenant_id: string } | null,
  logError: null as unknown,
  rpc: vi.fn(),
  inserts: [] as { table: string; row: Record<string, unknown> }[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-1", email: "hq@example.com" } },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => {
      state.rpc(name, args);
      if (name === "fn_admin_effective_permissions") {
        return Promise.resolve({ data: state.permissions, error: null });
      }
      if (name === "fn_proxy_end") return Promise.resolve(state.endResult);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: state.session, error: null });
      chain.insert = (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return Promise.resolve({ error: state.logError });
      };
      return chain;
    },
  }),
}));

import handler from "./end.js";

type Captured = { status: number; body: unknown };

async function end(): Promise<Captured> {
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
      body: {},
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [{ resource_key: "teacherConsoleProxy", level: "edit" }];
  state.endResult = { data: "session-1", error: null };
  state.session = { tenant_id: "tenant-1" };
  state.logError = null;
  state.inserts = [];
});

describe("POST /api/console/proxy/end", () => {
  test("teacherConsoleProxy edit 권한이 없으면 403 이고 세션을 닫지 않는다", async () => {
    state.permissions = [];

    const r = await end();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_proxy_end",
      expect.anything(),
    );
  });
});
