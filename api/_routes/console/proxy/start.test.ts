// POST /api/console/proxy/start 계약 검증. 관리자 클라이언트는 createSupabaseAdmin 모킹으로 바꿔 끼운다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: [] as { resource_key: string; level: string }[],
  permError: null as unknown,
  startResult: { data: "session-1", error: null } as {
    data: unknown;
    error: unknown;
  },
  logError: null as unknown,
  qa: false,
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
        return Promise.resolve({
          data: state.permError ? null : state.permissions,
          error: state.permError,
        });
      }
      if (name === "fn_proxy_start") return Promise.resolve(state.startResult);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => ({
      // QA 계정 조회(qa_accounts): state.qa 일 때만 QA 관리자다.
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: state.qa ? { profile_id: "admin-1" } : null,
              error: null,
            }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return Promise.resolve({ error: state.logError });
      },
    }),
  }),
}));

import handler from "./start.js";

type Captured = { status: number; body: unknown };

async function start(body: unknown): Promise<Captured> {
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

const VALID = { tenantId: "tenant-1", reason: "roster_proxy" };

beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = [{ resource_key: "teacherConsoleProxy", level: "edit" }];
  state.permError = null;
  state.startResult = { data: "session-1", error: null };
  state.logError = null;
  state.qa = false;
  state.inserts = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const READ_ONLY = { tenantId: "tenant-1", reason: "read_only" };

describe("POST /api/console/proxy/start", () => {
  test("teacherConsoleProxy edit 권한이 없으면 403 이고 세션을 열지 않는다", async () => {
    state.permissions = [
      { resource_key: "teacherConsoleProxy", level: "view" },
    ];

    const r = await start(VALID);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_proxy_start",
      expect.anything(),
    );
  });

  test("읽기 전용 사유는 teacherConsoleProxy view 권한으로도 대행을 연다", async () => {
    state.permissions = [
      { resource_key: "teacherConsoleProxy", level: "view" },
    ];

    const r = await start(READ_ONLY);

    expect(r.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("fn_proxy_start", {
      p_admin: "admin-1",
      p_tenant: "tenant-1",
      p_reason: "read_only",
    });
    expect(state.inserts[0]).toMatchObject({
      row: { action: "proxy_start", reason: "read_only" },
    });
  });

  test("teacherConsoleProxy 권한이 아예 없으면 읽기 전용도 403 이다", async () => {
    state.permissions = [];

    const r = await start(READ_ONLY);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_proxy_start",
      expect.anything(),
    );
  });

  test("QA 본사 관리자도 읽기 전용 대행은 시작한다(쓰기로 세지 않는다)", async () => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
    state.qa = true;

    const readOnly = await start(READ_ONLY);
    const roster = await start(VALID);

    expect(readOnly.status).toBe(200);
    expect(roster.status).toBe(403);
    expect(roster.body).toMatchObject({ code: "QA_ACCOUNT_READ_ONLY" });
  });

  test.each([
    ["사유 누락", { tenantId: "tenant-1" }],
    ["허용 밖 사유", { tenantId: "tenant-1", reason: "other" }],
    ["기관 누락", { reason: "admin_absent" }],
  ])("%s 이면 400 이고 세션을 열지 않는다", async (_label, body) => {
    const r = await start(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_proxy_start",
      expect.anything(),
    );
  });

  test("세션을 열고 id 를 돌려주며 proxy_start 감사 로그에 대행 세션을 싣는다", async () => {
    const r = await start(VALID);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, sessionId: "session-1" });
    expect(state.rpc).toHaveBeenCalledWith("fn_proxy_start", {
      p_admin: "admin-1",
      p_tenant: "tenant-1",
      p_reason: "roster_proxy",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        profile_id: "admin-1",
        actor_email: "hq@example.com",
        tenant_id: "tenant-1",
        actor_kind: "hq_proxy",
        proxy_session_id: "session-1",
        action: "proxy_start",
        resource_key: "teacherConsoleProxy",
        reason: "roster_proxy",
      },
    });
  });

  test("없는 기관이면 404 TENANT_NOT_FOUND 이고 로그를 남기지 않는다", async () => {
    state.startResult = {
      data: null,
      error: { code: "23503", message: "fk violation" },
    };

    const r = await start(VALID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: { code: "TENANT_NOT_FOUND" } });
    expect(state.inserts).toHaveLength(0);
  });

  test("감사 로그를 남기지 못하면 성공으로 끝나지 않고 500 이다", async () => {
    state.logError = { message: "insert failed" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await start(VALID);

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ error: { code: "INTERNAL" } });
    errorSpy.mockRestore();
  });
});
