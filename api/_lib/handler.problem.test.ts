// errorShape:"problem" 일 때 defineHandler 가 내는 모든 응답이 problem details 인지 검증한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  configError: false,
}));

vi.mock("./supabaseAdmin.js", () => ({
  getEnv: () => "cron-secret",
  isSupabaseConfigError: () => kit.configError,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { defineHandler } from "./handler.js";

type AuthMode = Parameters<typeof defineHandler>[0]["auth"];

function route(
  auth: AuthMode,
  handler: Parameters<typeof defineHandler>[0]["handler"] = async (
    _req,
    res,
  ) => {
    res.status(200).json({ ok: true });
  },
) {
  return defineHandler({
    methods: ["GET"],
    auth,
    errorShape: "problem",
    unhandledMessage: "처리하지 못했어요.",
    handler,
  });
}

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  opts: { method?: string; headers?: Record<string, string> } = {},
) {
  const out = {
    status: 0,
    contentType: undefined as string | undefined,
    body: undefined as unknown,
  };
  const headers = {
    authorization: "Bearer token",
    "x-vercel-id": "icn1::req-1",
    ...opts.headers,
  };
  const res = {
    req: { headers },
    setHeader(key: string, value: string) {
      if (key.toLowerCase() === "content-type") out.contentType = value;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    end(payload: string) {
      out.body = JSON.parse(payload);
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: opts.method ?? "GET",
      headers,
      query: {},
    } as unknown as VercelRequest,
    res,
  );
  return out;
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "u1", email: "u1@t.local" };
  kit.configError = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("defineHandler errorShape problem", () => {
  test("405 는 METHOD_NOT_ALLOWED problem 이다", async () => {
    const r = await call(route("none"), { method: "POST" });

    expect(r.status).toBe(405);
    expect(r.contentType).toBe("application/problem+json");
    expect(r.body).toEqual({
      type: "about:blank",
      title: "Method Not Allowed",
      status: 405,
      detail: "Method not allowed",
      instance: "icn1::req-1",
      code: "METHOD_NOT_ALLOWED",
    });
  });

  test("auth:user 토큰 없음은 401 UNAUTHENTICATED", async () => {
    kit.state.user = null;

    const r = await call(route("user"));

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({
      title: "Unauthorized",
      detail: "로그인이 필요합니다.",
      code: "UNAUTHENTICATED",
    });
  });

  test("auth:console 에서 콘솔 계정이 아니면 403 NOT_CONSOLE", async () => {
    kit.state.actor.kind = "none";

    const r = await call(route("console"));

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "NOT_CONSOLE" });
  });

  test("auth:cron 실패는 401 UNAUTHORIZED", async () => {
    const r = await call(route("cron"));

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test.each(["admin", "winningAdmin"] as const)(
    "auth:%s 로그인 실패는 401 UNAUTHENTICATED",
    async (auth) => {
      kit.state.user = null;

      const r = await call(route(auth));

      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({
        detail: "로그인이 필요합니다.",
        code: "UNAUTHENTICATED",
      });
    },
  );

  test.each(["admin", "winningAdmin"] as const)(
    "auth:%s 권한 없음은 403 FORBIDDEN",
    async (auth) => {
      kit.state.rows.profiles = () => ({ role: "user" });

      const r = await call(route(auth));

      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({
        detail: "관리자 권한이 필요합니다.",
        code: "FORBIDDEN",
      });
    },
  );

  test("관리자 확인 조회 실패는 500 INTERNAL_ERROR", async () => {
    kit.state.rows.profiles = () => {
      throw new Error("boom");
    };

    const r = await call(route("admin"));

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("QA 차단은 403 이고 code 와 detail 이 표준 멤버로 실린다", async () => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
    kit.state.rows.profiles = () => ({ role: "admin" });
    kit.state.rows.qa_accounts = () => ({ profile_id: "u1" });

    const r = await call(route("admin"), { method: "GET" });
    // 읽기는 통과하므로 쓰기 메서드 라우트로 다시 확인한다.
    const write = await call(
      defineHandler({
        methods: ["POST"],
        auth: "admin",
        errorShape: "problem",
        unhandledMessage: "x",
        handler: async (_q, res) => {
          res.status(200).json({});
        },
      }),
      { method: "POST" },
    );
    vi.unstubAllEnvs();

    expect(r.status).toBe(200);
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({
      title: "Forbidden",
      detail: "QA 계정이라 이 기능은 작동하지 않아요.",
      code: "QA_ACCOUNT_READ_ONLY",
    });
  });

  test("잘못된 X-Time-Zone 은 400 INVALID_TIME_ZONE", async () => {
    const r = await call(route("none"), { headers: { "x-time-zone": "KST" } });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      title: "Bad Request",
      code: "INVALID_TIME_ZONE",
    });
  });

  test("미처리 예외는 500 INTERNAL_ERROR 이고 로그는 그대로 남는다", async () => {
    const r = await call(
      route("none", async () => {
        throw new Error("boom");
      }),
    );

    expect(r.status).toBe(500);
    expect(r.contentType).toBe("application/problem+json");
    expect(r.body).toMatchObject({
      title: "Internal Server Error",
      detail: "처리하지 못했어요.",
      code: "INTERNAL_ERROR",
    });
    expect(console.error).toHaveBeenCalled();
  });

  test("설정 오류는 500 INTERNAL_ERROR 와 안내 문구", async () => {
    kit.configError = true;

    const r = await call(
      route("none", async () => {
        throw new Error("cfg");
      }),
    );

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      detail: "서버 설정이 올바르지 않습니다.",
      code: "INTERNAL_ERROR",
    });
  });
});
