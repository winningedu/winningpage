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

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
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

  test("열린 세션을 닫고 proxy_end 감사 로그에 닫은 세션을 싣는다", async () => {
    const r = await end();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, ended: true, sessionId: "session-1" });
    expect(state.rpc).toHaveBeenCalledWith("fn_proxy_end", {
      p_admin: "admin-1",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        profile_id: "admin-1",
        tenant_id: "tenant-1",
        actor_kind: "hq_proxy",
        proxy_session_id: "session-1",
        action: "proxy_end",
        resource_key: "teacherConsoleProxy",
      },
    });
  });

  test("열린 세션이 없으면 200 ended false 이고 로그를 남기지 않는다", async () => {
    state.endResult = { data: null, error: null };

    const r = await end();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, ended: false });
    expect(state.inserts).toHaveLength(0);
  });

  test("감사 로그를 남기지 못하면 성공으로 끝나지 않고 500 이다", async () => {
    state.logError = { message: "insert failed" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await end();

    expect(r.status).toBe(500);
    errorSpy.mockRestore();
  });
});
