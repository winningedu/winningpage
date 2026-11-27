// defineHandler(auth:"user", errorShape:"problem") 와 Hono user 미들웨어가 같은 입력에 같은 응답을 내는지 본다.
// 비교: status, problem 바디 글자(키 순서 포함), Content-Type, 401 에도 실리는 Cache-Control, 요청 로그 한 줄(userId 포함).
// 다른 점은 405 의 Allow 헤더 하나다(새로 붙인다, RFC 9110 15.5.6).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAdminFake } from "../adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  configError: null as unknown,
}));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: (error: unknown) => error === kit.configError,
  createSupabaseAdmin: () => kit.admin,
}));

import { defineHandler, requireUserId } from "../handler.js";
import { userFactory } from "./factory.js";
import { methodNotAllowed } from "./problem.js";
import { createRootApp } from "./root.js";
import { user } from "./user.js";

const PATH = "/api/demo";
const unhandledMessage = "데모를 처리하지 못했어요.";
const logLabel = "[demo]";
const headers = { "Cache-Control": "no-store" };

// 라우트마다 바꾸는 동작. 두 쪽 핸들러가 같은 함수를 부른다.
let behavior: (timeZone: string | undefined) => unknown = () => ({ ok: 1 });

const oldRoute = defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "problem",
  unhandledMessage,
  logLabel,
  headers,
  handler: async (_req, res, ctx) => {
    requireUserId(ctx);
    res.status(200).json(await behavior(ctx.timeZone));
  },
});

const guard = user({ unhandledMessage, logLabel, headers });
const newApp = createRootApp().route(
  "/api/demo",
  userFactory
    .createApp()
    .get("/", guard, async (c) =>
      c.json((await behavior(c.var.timeZone)) as object),
    )
    .all("/", methodNotAllowed("GET")),
);

const BASE_HEADERS = {
  authorization: "Bearer user-token",
  "x-vercel-id": "icn1::demo",
};

interface Outcome {
  status: number;
  body: string;
  contentType: string | undefined;
  cacheControl: string | undefined;
  log: Record<string, unknown> | undefined;
}

function captureLog(): () => Record<string, unknown> | undefined {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  return () => {
    const line = spy.mock.calls
      .map((args) => String(args[0]))
      .find((text) => text.startsWith('{"requestId"'));
    spy.mockRestore();
    if (!line) return undefined;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    // 걸린 시간만 매번 다르다. 키 자리는 남긴다.
    return { ...parsed, durationMs: typeof parsed.durationMs };
  };
}

async function callOld(
  requestHeaders: Record<string, string>,
): Promise<Outcome> {
  const listeners: (() => void)[] = [];
  const out = { body: "", headers: {} as Record<string, string> };
  const req = {
    method: "GET",
    url: PATH,
    headers: { ...BASE_HEADERS, ...requestHeaders },
    query: {},
    body: undefined,
  };
  const finish = () => {
    for (const listener of listeners) listener();
  };
  const res = {
    req,
    statusCode: 200,
    on(event: string, listener: () => void) {
      if (event === "finish") listeners.push(listener);
    },
    setHeader(key: string, value: string) {
      out.headers[key.toLowerCase()] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    // Vercel res.json 과 같은 헤더를 붙인다.
    json(payload: unknown) {
      out.headers["content-type"] ??= "application/json; charset=utf-8";
      out.body = JSON.stringify(payload);
      finish();
      return res;
    },
    end(payload?: string) {
      out.body = payload ?? "";
      finish();
      return res;
    },
  };
  const readLog = captureLog();
  await oldRoute(
    req as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return {
    status: res.statusCode,
    body: out.body,
    contentType: out.headers["content-type"],
    cacheControl: out.headers["cache-control"],
    log: readLog(),
  };
}

async function callNew(
  requestHeaders: Record<string, string>,
): Promise<Outcome> {
  const readLog = captureLog();
  const response = await newApp.request(PATH, {
    headers: { ...BASE_HEADERS, ...requestHeaders },
  });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? undefined,
    cacheControl: response.headers.get("cache-control") ?? undefined,
    log: readLog(),
  };
}

const expectSame = async (
  requestHeaders: Record<string, string>,
  status: number,
) => {
  kit.admin = createAdminFake({ permissions: [] });
  const before = await callOld(requestHeaders);
  kit.admin = createAdminFake({ permissions: [] });
  const after = await callNew(requestHeaders);
  expect(after).toEqual(before);
  expect(before.status).toBe(status);
  return before;
};

beforeEach(() => {
  behavior = () => ({ ok: 1 });
  kit.configError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("defineHandler 와 Hono user 미들웨어의 응답 비교", () => {
  test("성공: 바디, charset 붙은 JSON, Cache-Control, 로그 한 줄(userId 포함)이 같다", async () => {
    const before = await expectSame({}, 200);
    expect(before.contentType).toBe("application/json; charset=utf-8");
    expect(before.cacheControl).toBe("no-store");
    expect(Object.keys(before.log ?? {})).toEqual([
      "requestId",
      "route",
      "method",
      "status",
      "durationMs",
      "userId",
    ]);
    expect(before.log?.userId).toBe("admin-1");
  });

  test("토큰이 없으면 401 UNAUTHENTICATED 이고 Cache-Control 이 오류 응답에도 실린다", async () => {
    const before = await expectSame({ authorization: "" }, 401);
    expect(before.cacheControl).toBe("no-store");
    expect(JSON.parse(before.body).code).toBe("UNAUTHENTICATED");
    expect(before.log?.userId).toBeNull();
  });

  test("잘못된 토큰(사용자 조회 실패)은 401 이다", async () => {
    kit.admin = createAdminFake({ permissions: [] });
    const fake = kit.admin as ReturnType<typeof createAdminFake>;
    fake.auth.getUser = async () => ({
      data: { user: null as never },
      error: null,
    });
    const before = await callOld({});
    kit.admin = fake;
    const after = await callNew({});
    expect(after).toEqual(before);
    expect(before.status).toBe(401);
  });

  test("잘못된 X-Time-Zone 은 토큰이 있어도 없어도 같은 400 INVALID_TIME_ZONE 이다", async () => {
    const withToken = await expectSame({ "x-time-zone": "Mars/Base" }, 400);
    expect(JSON.parse(withToken.body).code).toBe("INVALID_TIME_ZONE");
    await expectSame({ authorization: "", "x-time-zone": "Mars/Base" }, 400);
  });

  test("유효한 X-Time-Zone 은 핸들러에 같은 값으로 닿는다", async () => {
    behavior = (timeZone) => ({ timeZone });
    const before = await expectSame({ "x-time-zone": "Asia/Seoul" }, 200);
    expect(JSON.parse(before.body)).toEqual({ timeZone: "Asia/Seoul" });
  });

  test("미처리 예외는 같은 500 이다", async () => {
    behavior = () => {
      throw new Error("db down");
    };
    const before = await expectSame({}, 500);
    expect(JSON.parse(before.body).detail).toBe(unhandledMessage);
  });

  test("Supabase 설정 오류는 같은 500 이다", async () => {
    const configError = new Error("config");
    kit.configError = configError;
    behavior = () => {
      throw configError;
    };
    await expectSame({}, 500);
  });
});
