// defineHandler(auth:"admin", errorShape:"problem") 와 Hono admin 미들웨어가 같은 입력에 같은 응답을 내는지 본다.
// 비교: status, problem 바디 글자(키 순서 포함), 성공 Content-Type, 요청 로그 한 줄, 감사 행.
// 다른 점은 405 의 Allow 헤더 하나다(새로 붙인다, RFC 9110 15.5.6).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  createAdminFake,
  createRecorder,
  type Respond,
} from "../adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  configError: null as unknown,
}));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: (error: unknown) => error === kit.configError,
  createSupabaseAdmin: () => kit.admin,
}));

// vitest.setup.ts 가 기본으로 끈 실제 감사 적재 모듈을 쓴다.
vi.unmock("../accessLog/adminWrite.js");

import { defineHandler, RouteParamError } from "../handler.js";
import { QaBlockedError } from "../qaAccount.js";
import { admin, createAdminApp } from "./admin.js";
import { methodNotAllowed } from "./problem.js";
import { createRootApp } from "./root.js";
import { validate } from "./validate.js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const PATH = `/api/admin/demo/${ID}`;

// 라우트마다 바꾸는 동작. 두 쪽 핸들러가 같은 함수를 부른다.
let behavior: () => unknown = () => ({ id: ID });

const unhandledMessage = "데모를 처리하지 못했어요.";
const logLabel = "[admin/demo]";
const bodySchema = z.object({ name: z.string().min(1) });
const querySchema = z.object({ id: z.uuid(), q: z.string().max(3).optional() });

type Variant = "plain" | "headers" | "keyFn" | "auditUpdate" | "auditOff";

function oldRoute(variant: Variant, method: "GET" | "POST") {
  return defineHandler({
    methods: ["GET", "POST"],
    auth: "admin",
    errorShape: "problem",
    permission:
      variant === "keyFn"
        ? {
            key: (req) => {
              if (req.query.id !== ID)
                throw new RouteParamError("id", "모르는 키");
              return "coupons";
            },
          }
        : { key: "coupons" as const },
    ...(variant === "auditUpdate"
      ? { audit: { action: "update" as const } }
      : {}),
    ...(variant === "auditOff" ? { audit: false as const } : {}),
    ...(variant === "headers"
      ? { headers: { "Cache-Control": "no-store" } }
      : {}),
    unhandledMessage,
    logLabel,
    query: querySchema,
    ...(method === "POST" ? { body: bodySchema } : {}),
    handler: async (_req, res) => {
      const data = await behavior();
      res.status(method === "POST" ? 201 : 200).json(data);
    },
  });
}

function newApp(variant: Variant) {
  const options = {
    permission:
      variant === "keyFn"
        ? {
            key: (c: {
              req: { param: (name: string) => string | undefined };
            }) => {
              if (c.req.param("id") !== ID)
                throw new RouteParamError("id", "모르는 키");
              return "coupons";
            },
          }
        : { key: "coupons" as const },
    ...(variant === "auditUpdate"
      ? { audit: { action: "update" as const } }
      : {}),
    ...(variant === "auditOff" ? { audit: false as const } : {}),
    ...(variant === "headers"
      ? { headers: { "Cache-Control": "no-store" } }
      : {}),
    unhandledMessage,
    logLabel,
  };
  const query = z.object({ q: z.string().max(3).optional() });
  const routes = createAdminApp()
    .get(
      "/api/admin/demo/:id",
      admin(options),
      validate("query", query),
      validate("param", z.object({ id: z.uuid() })),
      async (c) => c.json((await behavior()) as object),
    )
    .post(
      "/api/admin/demo/:id",
      admin(options),
      validate("json", bodySchema),
      validate("query", query),
      validate("param", z.object({ id: z.uuid() })),
      async (c) => c.json((await behavior()) as object, 201),
    )
    .all("/api/admin/demo/:id", methodNotAllowed("GET", "POST"));
  return createRootApp().route("/", routes);
}

interface Request {
  method: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  search?: Record<string, string>;
}

interface Outcome {
  status: number;
  body: string;
  contentType: string | undefined;
  cacheControl: string | undefined;
  log: Record<string, unknown> | undefined;
  audit: unknown;
}

const BASE_HEADERS = {
  authorization: "Bearer admin-token",
  "x-vercel-id": "icn1::demo",
  "x-forwarded-for": "203.0.113.7, 10.0.0.1",
};

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

async function auditRow(): Promise<unknown> {
  // 감사 행은 응답 뒤에 적재된다.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const fake = kit.admin as ReturnType<typeof createAdminFake>;
  const insert = fake.queries.find(
    (query) => query.table === "admin_access_logs",
  );
  return insert?.calls.find((call) => call.method === "insert")?.args[0];
}

async function callOld(variant: Variant, request: Request): Promise<Outcome> {
  const headers = { ...BASE_HEADERS, ...request.headers };
  const path = request.path ?? PATH;
  const search = new URLSearchParams(request.search).toString();
  const listeners: (() => void)[] = [];
  const out = { body: "", headers: {} as Record<string, string> };
  const req = {
    method: request.method,
    url: search ? `${path}?${search}` : path,
    headers,
    query: { ...request.search, id: path.split("/").pop() },
    body: request.body,
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
  await oldRoute(variant, request.method === "POST" ? "POST" : "GET")(
    req as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return {
    status: res.statusCode,
    body: out.body,
    contentType: out.headers["content-type"],
    cacheControl: out.headers["cache-control"],
    log: readLog(),
    audit: await auditRow(),
  };
}

async function callNew(
  variant: Variant,
  request: Request,
): Promise<Outcome & { allow: string | null }> {
  const path = request.path ?? PATH;
  const search = new URLSearchParams(request.search).toString();
  const readLog = captureLog();
  const response = await newApp(variant).request(
    search ? `${path}?${search}` : path,
    {
      method: request.method,
      headers: {
        ...BASE_HEADERS,
        ...(request.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...request.headers,
      },
      ...(request.body === undefined
        ? {}
        : { body: JSON.stringify(request.body) }),
    },
  );
  const body = await response.text();
  return {
    status: response.status,
    body,
    contentType: response.headers.get("content-type") ?? undefined,
    cacheControl: response.headers.get("cache-control") ?? undefined,
    log: readLog(),
    audit: await auditRow(),
    allow: response.headers.get("allow"),
  };
}

let permissions: { resource_key: string; level: string }[] = [];
let tables: Record<string, Respond> = {};

function freshFake() {
  kit.admin = createAdminFake({ permissions, tables });
}

// 가짜를 만든 뒤 고칠 점(관리자 아님 등). 두 쪽에 똑같이 건다.
let mutate: (fake: ReturnType<typeof createAdminFake>) => void = () => {};

async function both(variant: Variant, request: Request) {
  freshFake();
  mutate(kit.admin as ReturnType<typeof createAdminFake>);
  const before = await callOld(variant, request);
  freshFake();
  mutate(kit.admin as ReturnType<typeof createAdminFake>);
  const after = await callNew(variant, request);
  return { before, after };
}

beforeEach(() => {
  behavior = () => ({ id: ID });
  permissions = [{ resource_key: "coupons", level: "edit" }];
  tables = {};
  mutate = () => {};
  kit.configError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// 새 쪽 admin() 은 Cache-Control no-store 를 기본으로 건다(owner 결정 2026-11-26). 그 밖은 같아야 한다.
const expectSame = async (
  variant: Variant,
  request: Request,
  status: number,
  newCacheControl: string | null = "no-store",
) => {
  const { before, after } = await both(variant, request);
  const { allow: _allow, cacheControl, ...rest } = after;
  const { cacheControl: _oldCacheControl, ...restBefore } = before;
  expect(rest).toEqual(restBefore);
  expect(cacheControl ?? null).toBe(newCacheControl);
  expect(before.status).toBe(status);
  return { before, after };
};

describe("defineHandler 와 Hono admin 미들웨어의 응답 비교", () => {
  test("GET 성공: 바디, charset 붙은 JSON, 로그 한 줄, view 감사 행이 같다", async () => {
    const { before } = await expectSame("plain", { method: "GET" }, 200);
    expect(before.contentType).toBe("application/json; charset=utf-8");
    expect(Object.keys(before.log ?? {})).toEqual([
      "requestId",
      "route",
      "method",
      "status",
      "durationMs",
      "userId",
    ]);
    expect(before.audit).toMatchObject({ action: "view", target_id: ID });
  });

  test("POST 성공은 201 과 create 감사 행이 같다", async () => {
    const { before } = await expectSame(
      "plain",
      { method: "POST", body: { name: "a" } },
      201,
    );
    expect(before.audit).toMatchObject({ action: "create" });
  });

  test("토큰이 없으면 401 UNAUTHENTICATED 이고 감사 행이 없다", async () => {
    const { before } = await expectSame(
      "plain",
      { method: "GET", headers: { authorization: "" } },
      401,
    );
    expect(before.audit).toBeUndefined();
  });

  test("관리자가 아니면 403 FORBIDDEN 이다", async () => {
    // createAdminFake 는 role 조회를 admin 으로 가로채므로 profiles 만 user 로 바꾼다.
    mutate = (fake) => {
      const others = fake.from;
      const profiles = createRecorder({
        profiles: () => ({ data: { role: "user" }, error: null }),
      }).from;
      fake.from = (table: string) =>
        table === "profiles" ? profiles(table) : others(table);
    };
    const { before } = await expectSame("plain", { method: "GET" }, 403);
    expect(JSON.parse(before.body).code).toBe("FORBIDDEN");
  });

  test("관리자 판정 조회가 실패하면 500 INTERNAL_ERROR 다", async () => {
    mutate = (fake) => {
      const others = fake.from;
      const profiles = createRecorder({
        profiles: () => ({ data: null, error: { message: "down" } }),
      }).from;
      fake.from = (table: string) =>
        table === "profiles" ? profiles(table) : others(table);
    };
    await expectSame("plain", { method: "GET" }, 500);
  });

  test("메뉴 권한이 없으면 403 FORBIDDEN 이고 감사 행은 남는다", async () => {
    permissions = [];
    const { before } = await expectSame("plain", { method: "GET" }, 403);
    expect(before.audit).toMatchObject({
      action: "view",
      meta: { status: 403 },
    });
  });

  test("view 권한으로 쓰기는 403 FORBIDDEN 이다", async () => {
    permissions = [{ resource_key: "coupons", level: "view" }];
    await expectSame("plain", { method: "POST", body: { name: "a" } }, 403);
  });

  test("QA 관리자의 쓰기는 403 QA_ACCOUNT_READ_ONLY 다", async () => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
    tables = {
      qa_accounts: () => ({ data: { profile_id: "admin-1" }, error: null }),
    };
    const { before } = await expectSame(
      "plain",
      { method: "POST", body: { name: "a" } },
      403,
    );
    expect(JSON.parse(before.body).code).toBe("QA_ACCOUNT_READ_ONLY");
  });

  test("핸들러가 던진 QaBlockedError 는 403 이다", async () => {
    behavior = () => {
      throw new QaBlockedError("QA_ACCOUNT_RESTRICTED");
    };
    await expectSame("plain", { method: "GET" }, 403);
  });

  test("잘못된 X-Time-Zone 은 400 INVALID_TIME_ZONE 이다", async () => {
    await expectSame(
      "plain",
      { method: "GET", headers: { "x-time-zone": "Mars/Base" } },
      400,
    );
  });

  test("본문 검증 실패는 같은 400 VALIDATION_FAILED errors 다", async () => {
    const { before } = await expectSame(
      "plain",
      { method: "POST", body: { name: "" } },
      400,
    );
    expect(JSON.parse(before.body).errors).toHaveLength(1);
  });

  test("쿼리 검증 실패는 같은 400 VALIDATION_FAILED errors 다", async () => {
    await expectSame("plain", { method: "GET", search: { q: "abcd" } }, 400);
  });

  test("경로 id 검증 실패는 같은 400 이다", async () => {
    await expectSame(
      "plain",
      { method: "GET", path: "/api/admin/demo/abc" },
      400,
    );
  });

  test("권한 키 함수가 RouteParamError 를 던지면 400 이고 감사 행이 없다", async () => {
    const { before } = await expectSame(
      "keyFn",
      { method: "GET", path: "/api/admin/demo/other" },
      400,
    );
    expect(before.audit).toBeUndefined();
  });

  test("미처리 예외는 라우트 문구의 500 INTERNAL_ERROR 다", async () => {
    behavior = () => {
      throw new Error("boom");
    };
    const { before } = await expectSame("plain", { method: "GET" }, 500);
    expect(JSON.parse(before.body).detail).toBe(unhandledMessage);
  });

  test("설정 오류는 설정 문구의 500 이다", async () => {
    const error = new Error("config");
    kit.configError = error;
    behavior = () => {
      throw error;
    };
    await expectSame("plain", { method: "GET" }, 500);
  });

  test("headers 옵션은 401 응답에도 실린다", async () => {
    const { before } = await expectSame(
      "headers",
      { method: "GET", headers: { authorization: "" } },
      401,
    );
    expect(before.cacheControl).toBe("no-store");
  });

  test("audit action 을 바꾸면 그 action 으로 남는다", async () => {
    const { before } = await expectSame(
      "auditUpdate",
      { method: "POST", body: { name: "a" } },
      201,
    );
    expect(before.audit).toMatchObject({ action: "update" });
  });

  test("audit false 면 감사 행이 없다", async () => {
    const { before } = await expectSame("auditOff", { method: "GET" }, 200);
    expect(before.audit).toBeUndefined();
  });

  test("지원하지 않는 메서드는 같은 405 이고 새 쪽만 Allow 를 붙인다", async () => {
    // 405 는 admin() 앞에서 끝나 기본 헤더가 없다(defineHandler 도 405 뒤에 headers 를 건다).
    const { after } = await expectSame(
      "plain",
      { method: "DELETE" },
      405,
      null,
    );
    expect(after.allow).toBe("GET, HEAD, POST");
  });
});
