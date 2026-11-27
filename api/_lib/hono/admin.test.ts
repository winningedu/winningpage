// Hono 쪽에만 있는 동작: problem 404, 원문 경로 검사, 405 Allow, HEAD, 깨진 JSON, 본문 없는 POST, auth user 모드.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { createAdminFake } from "../adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  audit: vi.fn(),
}));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../accessLog/adminWrite.js")>()),
  scheduleAdminAudit: kit.audit,
}));

import { admin, createAdminApp, user } from "./admin.js";
import { methodNotAllowed, notFound } from "./problem.js";
import { createRootApp } from "./root.js";
import { validate } from "./validate.js";

const AUTH = { authorization: "Bearer admin-token" };
const OPTIONS = {
  permission: { key: "coupons" as const },
  unhandledMessage: "데모를 처리하지 못했어요.",
  logLabel: "[admin/demo]",
};

const guard = admin(OPTIONS);

const app = createRootApp().route(
  "/",
  createAdminApp()
    .get("/api/admin/demo", guard, (c) => c.json({ items: [] }))
    .get("/api/admin/demo/missing", guard, () => {
      throw notFound("사용 이력");
    })
    .get("/api/admin/demo/menu", guard, () => {
      throw notFound("메뉴");
    })
    .get(
      "/api/admin/demo/cache",
      admin({
        ...OPTIONS,
        headers: { "Cache-Control": "private, max-age=60" },
      }),
      (c) => c.json({}),
    )
    .post(
      "/api/admin/demo",
      guard,
      validate("json", z.object({ reason: z.string().optional() })),
      (c) => c.json(c.req.valid("json")),
    )
    .all("/api/admin/demo", methodNotAllowed("GET", "POST"))
    // 본문 값으로 메뉴 키를 정하는 라우트: 키 함수가 본문을 읽어도 뒤의 validate 가 같은 본문을 다시 읽는다.
    .post(
      "/api/admin/demo/body-key",
      admin({
        ...OPTIONS,
        permission: {
          key: async (c) => String((await c.req.json()).section),
        },
      }),
      validate("json", z.object({ section: z.string() })),
      (c) => c.json(c.req.valid("json")),
    )
    .post(
      "/api/admin/me",
      user({
        unhandledMessage: "활성화하지 못했어요.",
        logLabel: "[admin/me]",
      }),
      (c) => c.json({ userId: c.var.userId, token: c.var.token }),
    )
    .all("/api/admin/me", methodNotAllowed("POST"))
    .get(
      "/api/admin/own",
      admin({
        permission: "none",
        unhandledMessage: "x",
        logLabel: "[admin/own]",
      }),
      (c) => c.json({ userId: c.var.userId }),
    ),
);

const problem = async (response: Response) => ({
  status: response.status,
  contentType: response.headers.get("content-type"),
  body: (await response.json()) as Record<string, unknown>,
});

// Request 는 URL 을 표준대로 정규화한다(.. 접기, 역슬래시 바꾸기). 원문을 그대로 넘기는 런타임을 흉내 내려고 url 만 바꾼다.
const rawRequest = (path: string) => {
  const request = new Request(
    `http://localhost${path.replace(/[\\.]/g, "x")}`,
    {
      headers: AUTH,
    },
  );
  Object.defineProperty(request, "url", { value: `http://localhost${path}` });
  return request;
};

beforeEach(() => {
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "coupons", level: "edit" }],
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("없는 주소", () => {
  test("등록되지 않은 경로는 problem 404 NOT_FOUND 다", async () => {
    const r = await problem(
      await app.request("/api/admin/nothing", { headers: AUTH }),
    );
    expect(r).toEqual({
      status: 404,
      contentType: "application/problem+json",
      body: {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "요청한 주소를 찾을 수 없어요.",
        code: "NOT_FOUND",
      },
    });
  });

  test.each([
    "/api/admin/demo/../demo",
    "/api/admin/./demo",
    "/api/admin\\demo",
    "/api/admin/%2e%2e/demo",
    "/api/admin/de%6do",
    "/api/admin//demo",
    "/api/admin/[id]/demo",
  ])("원문 경로 %s 는 라우트를 찾지 않고 problem 404 다", async (path) => {
    const response = await app.fetch(rawRequest(path));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("NOT_FOUND");
  });

  test.each(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"])(
    "끝 슬래시 주소는 라우트가 있어도 %s 에 problem 404 다",
    async (method) => {
      const response = await app.request("/api/admin/demo/", {
        method,
        headers: AUTH,
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe(
        "application/problem+json",
      );
      expect(response.headers.get("allow")).toBeNull();
      if (method !== "HEAD") {
        expect(await response.json()).toEqual({
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: "요청한 주소를 찾을 수 없어요.",
          code: "NOT_FOUND",
        });
      }
    },
  );
});

describe("admin() 기본 헤더와 404 헬퍼", () => {
  test("관리자 응답은 기본으로 Cache-Control no-store 다(오류 응답 포함)", async () => {
    const ok = await app.request("/api/admin/demo", { headers: AUTH });
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const denied = await app.request("/api/admin/demo");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toBe("no-store");
  });

  test("headers 옵션이 기본값을 바꾼다", async () => {
    const r = await app.request("/api/admin/demo/cache", { headers: AUTH });
    expect(r.headers.get("cache-control")).toBe("private, max-age=60");
  });

  test("notFound(what) 는 받침에 맞는 조사로 problem 404 를 낸다", async () => {
    const a = await problem(
      await app.request("/api/admin/demo/missing", { headers: AUTH }),
    );
    expect(a.status).toBe(404);
    expect(a.body).toMatchObject({
      detail: "사용 이력을 찾을 수 없어요.",
      code: "NOT_FOUND",
    });
    const b = await problem(
      await app.request("/api/admin/demo/menu", { headers: AUTH }),
    );
    expect(b.body.detail).toBe("메뉴를 찾을 수 없어요.");
  });
});

describe("메서드", () => {
  test("지원하지 않는 메서드는 405 와 라우트의 Allow 다", async () => {
    const response = await app.request("/api/admin/demo", {
      method: "DELETE",
      headers: AUTH,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, POST");
    expect((await response.json()).code).toBe("METHOD_NOT_ALLOWED");
  });

  test("GET 이 없는 라우트의 Allow 에는 HEAD 를 넣지 않는다", async () => {
    const response = await app.request("/api/admin/me", { headers: AUTH });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  test("HEAD 는 GET 결과를 본문 없이 돌려준다", async () => {
    const response = await app.request("/api/admin/demo", {
      method: "HEAD",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("본문", () => {
  test("JSON Content-Type 의 깨진 본문은 400 VALIDATION_FAILED 다", async () => {
    const r = await problem(
      await app.request("/api/admin/demo", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(r.status).toBe(400);
    expect(r.contentType).toBe("application/problem+json");
    expect(r.body).toMatchObject({
      detail: "요청 값이 올바르지 않아요.",
      code: "VALIDATION_FAILED",
      errors: [],
    });
  });

  test("본문 없는 POST 는 빈 객체로 검증한다(필드가 모두 선택이면 통과)", async () => {
    const response = await app.request("/api/admin/demo", {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });
});

describe("요청 로그", () => {
  test("404 도 요청 경로 원문으로 한 줄 남긴다", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await app.request("/api/admin/nothing?q=1", {
      headers: { ...AUTH, "x-vercel-id": "icn1::x" },
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      requestId: "icn1::x",
      route: "/api/admin/nothing",
      method: "GET",
      status: 404,
      userId: null,
    });
  });
});

describe("비동기 메뉴 키 함수", () => {
  const post = (section: string) =>
    app.request("/api/admin/demo/body-key", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ section }),
    });

  test("본문을 읽어 정한 키로 권한을 보고, 같은 본문을 뒤 검증이 다시 읽는다", async () => {
    const ok = await post("coupons");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ section: "coupons" });
  });

  test("권한이 없는 키는 403 이다", async () => {
    const denied = await post("members");
    expect(denied.status).toBe(403);
  });
});

describe("메뉴 키 타입", () => {
  test("목록에 없는 리터럴 키는 컴파일 오류다(키 함수는 string 을 돌려도 된다)", () => {
    admin({
      // @ts-expect-error 메뉴 키 목록에 없는 키
      permission: { key: "nope" },
      unhandledMessage: "x",
      logLabel: "[x]",
    });
    admin({
      permission: { key: (c) => String(c.req.param("key")) },
      unhandledMessage: "x",
      logLabel: "[x]",
    });
  });
});

describe('permission "none"', () => {
  test("메뉴 권한 행이 없는 관리자도 통과하고 감사 행을 예약하지 않는다", async () => {
    kit.admin = createAdminFake({ permissions: [] });
    kit.audit.mockClear();
    const response = await app.request("/api/admin/own", { headers: AUTH });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "admin-1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(kit.audit).not.toHaveBeenCalled();
  });

  test("토큰이 없으면 401 이다", async () => {
    const r = await problem(await app.request("/api/admin/own"));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("UNAUTHENTICATED");
  });

  test("관리자가 아니면 403 FORBIDDEN 이다", async () => {
    const fake = createAdminFake({ permissions: [] });
    const from = (table: string) =>
      table === "profiles"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: "user" },
                  error: null,
                }),
              }),
            }),
          }
        : fake.from(table);
    kit.admin = { ...fake, from };
    const r = await problem(
      await app.request("/api/admin/own", { headers: AUTH }),
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
  });
});

describe("auth user 모드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED 다", async () => {
    const r = await problem(
      await app.request("/api/admin/me", { method: "POST" }),
    );
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({
      detail: "로그인이 필요합니다.",
      code: "UNAUTHENTICATED",
    });
  });

  test("로그인한 사용자의 id 와 토큰을 c.var 로 넘긴다", async () => {
    const response = await app.request("/api/admin/me", {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "admin-1",
      token: "admin-token",
    });
  });
});
