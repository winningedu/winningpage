// user() 미들웨어: 로그인 사용자 라우트(defineHandler auth:"user")를 Hono 로 옮긴 것의 동작.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAdminFake } from "../adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { isAuthMiddleware } from "./admin.js";
import { userFactory } from "./factory.js";
import { methodNotAllowed } from "./problem.js";
import { createRootApp } from "./root.js";
import { user } from "./user.js";

const AUTH = { authorization: "Bearer user-token" };
const OPTIONS = {
  unhandledMessage: "데모를 처리하지 못했어요.",
  logLabel: "[demo]",
  headers: { "Cache-Control": "no-store" },
};

const guard = user(OPTIONS);

const app = createRootApp().route(
  "/api/demo",
  userFactory
    .createApp()
    .get("/", guard, (c) =>
      c.json({
        userId: c.var.userId,
        token: c.var.token,
        email: c.var.user.id,
        timeZone: c.var.timeZone ?? null,
        hasClient: typeof c.var.supabaseAdmin.from === "function",
      }),
    )
    .get("/boom", guard, () => {
      throw new Error("db down");
    })
    .all("/", methodNotAllowed("GET")),
);

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("user()", () => {
  test("로그인한 사용자의 id, 토큰, 유저, DB 클라이언트를 c.var 로 넘긴다", async () => {
    const response = await app.request("/api/demo", { headers: AUTH });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "admin-1",
      token: "user-token",
      email: "admin-1",
      timeZone: null,
      hasClient: true,
    });
  });

  test("토큰이 없으면 401 UNAUTHENTICATED problem 이고 headers 옵션이 오류 응답에도 실린다", async () => {
    const response = await app.request("/api/demo");
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: 401,
      detail: "로그인이 필요합니다.",
      code: "UNAUTHENTICATED",
    });
  });

  test("잘못된 X-Time-Zone 은 토큰이 없어도 400 INVALID_TIME_ZONE 이다(인증보다 먼저)", async () => {
    const response = await app.request("/api/demo", {
      headers: { "x-time-zone": "Mars/Base" },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_TIME_ZONE");
  });

  test("유효한 X-Time-Zone 은 c.var.timeZone 으로 넘긴다", async () => {
    const response = await app.request("/api/demo", {
      headers: { ...AUTH, "x-time-zone": "Asia/Seoul" },
    });
    expect((await response.json()).timeZone).toBe("Asia/Seoul");
  });

  test("미처리 예외는 unhandledMessage 의 500 이다", async () => {
    const response = await app.request("/api/demo/boom", { headers: AUTH });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      detail: "데모를 처리하지 못했어요.",
    });
  });

  test("지원하지 않는 메서드는 405 와 Allow 다", async () => {
    const response = await app.request("/api/demo", {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  test("라우트 표 가드가 인증 미들웨어로 알아본다", () => {
    expect(isAuthMiddleware(guard)).toBe(true);
  });
});
