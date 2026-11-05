// defineHandler auth:"console" 계약 검증. fn_console_actor 결과만 케이스마다 바꾼다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type ActorRow = {
  kind: string;
  tenant_id: string | null;
  teacher_id: string | null;
  class_ids: string[];
  proxy_session_id: string | null;
  must_change_password: boolean | null;
};

const state = vi.hoisted(() => ({
  user: { id: "profile-1", email: "t@example.com" } as {
    id: string;
    email: string;
  } | null,
  actor: null as unknown,
  rpcError: null as unknown,
  loginId: "kim01" as string | null,
  rpc: vi.fn(),
}));

vi.mock("./supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.user ? null : { message: "bad" },
      }),
    },
    rpc: (...args: unknown[]) => {
      state.rpc(...args);
      return Promise.resolve({
        data: state.rpcError ? null : [state.actor],
        error: state.rpcError,
      });
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: state.loginId ? { login_id: state.loginId } : null,
        error: null,
      });
      return chain;
    },
  }),
}));

import { defineHandler, type HandlerCtx } from "./handler.js";

function teacherRow(over: Partial<ActorRow> = {}): ActorRow {
  return {
    kind: "homeroom",
    tenant_id: "tenant-1",
    teacher_id: "teacher-1",
    class_ids: ["class-1"],
    proxy_session_id: null,
    must_change_password: false,
    ...over,
  };
}

const seen: { ctx?: HandlerCtx | undefined } = {};

function build(
  extra: { consoleRole?: "schoolAdmin"; allowMustChange?: boolean } = {},
) {
  return defineHandler({
    methods: ["GET"],
    auth: "console",
    errorShape: "coded",
    unhandledMessage: "fail",
    unhandledCode: "INTERNAL",
    ...extra,
    handler: async (_req, res, ctx) => {
      seen.ctx = ctx;
      res.status(200).json({ ok: true });
    },
  });
}

async function call(
  handler: ReturnType<typeof build>,
  headers: Record<string, string> = { authorization: "Bearer tok" },
) {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => undefined,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler({ method: "GET", headers } as unknown as VercelRequest, res);
  return out;
}

const code = (r: { body: unknown }) =>
  (r.body as { error: { code: string } }).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  seen.ctx = undefined;
  state.user = { id: "profile-1", email: "t@example.com" };
  state.actor = teacherRow();
  state.rpcError = null;
  state.loginId = "kim01";
});

describe('defineHandler auth:"console"', () => {
  test("토큰이 없으면 401 이고 행위자 조회를 하지 않는다", async () => {
    const r = await call(build(), {});

    expect(r.status).toBe(401);
    expect(code(r)).toBe("UNAUTHENTICATED");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("kind 가 none 인 사용자(학생 등)는 403 NOT_CONSOLE 이다", async () => {
    state.actor = {
      ...teacherRow({ kind: "none", tenant_id: null, teacher_id: null }),
      must_change_password: null,
    };

    const r = await call(build());

    expect(r.status).toBe(403);
    expect(code(r)).toBe("NOT_CONSOLE");
    expect(seen.ctx).toBeUndefined();
  });

  test("교사는 ctx.console 에 행위자 정보가 채워진다", async () => {
    const r = await call(build());

    expect(r.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("fn_console_actor", {
      p_profile_id: "profile-1",
    });
    expect(seen.ctx?.console).toEqual({
      kind: "homeroom",
      tenantId: "tenant-1",
      teacherId: "teacher-1",
      classIds: ["class-1"],
      proxySessionId: null,
      mustChangePassword: false,
      loginId: "kim01",
    });
    expect(seen.ctx?.userId).toBe("profile-1");
  });

  test("임시 비밀번호 상태는 403 MUST_CHANGE_PASSWORD, allowMustChange 면 통과한다", async () => {
    state.actor = teacherRow({ must_change_password: true });

    const blocked = await call(build());
    const allowed = await call(build({ allowMustChange: true }));

    expect(blocked.status).toBe(403);
    expect(code(blocked)).toBe("MUST_CHANGE_PASSWORD");
    expect(allowed.status).toBe(200);
  });

  test('consoleRole "schoolAdmin" 은 담임을 403 으로 막고 학교 관리자와 대행은 통과시킨다', async () => {
    const handler = build({ consoleRole: "schoolAdmin" });

    const homeroom = await call(handler);
    state.actor = teacherRow({ kind: "school_admin", class_ids: [] });
    const admin = await call(handler);
    state.actor = teacherRow({
      kind: "hq_proxy",
      teacher_id: null,
      class_ids: [],
      proxy_session_id: "proxy-1",
      must_change_password: false,
    });
    const proxy = await call(handler);

    expect(homeroom.status).toBe(403);
    expect(code(homeroom)).toBe("NOT_SCHOOL_ADMIN");
    expect(admin.status).toBe(200);
    expect(proxy.status).toBe(200);
    expect(seen.ctx?.console).toMatchObject({
      kind: "hq_proxy",
      proxySessionId: "proxy-1",
      teacherId: null,
      loginId: null,
    });
  });

  test("행위자 조회가 실패하면 403 이 아니라 500 이다", async () => {
    state.rpcError = { code: "XX000" };

    const r = await call(build());

    expect(r.status).toBe(500);
  });
});
