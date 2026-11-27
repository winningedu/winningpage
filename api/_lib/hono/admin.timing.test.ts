// admin() 미들웨어의 인증 단계별 시간 로그(admin_auth_timing). 응답은 바꾸지 않고 로그 한 줄만 남긴다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAdminFake } from "../adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../accessLog/adminWrite.js")>()),
  scheduleAdminAudit: vi.fn(),
}));

import { admin, createAdminApp } from "./admin.js";
import { createRootApp } from "./root.js";

const AUTH = { authorization: "Bearer secret-token" };
const guard = admin({
  permission: { key: "coupons" },
  unhandledMessage: "데모를 처리하지 못했어요.",
  logLabel: "[admin/demo]",
});

const app = createRootApp().route(
  "/",
  createAdminApp()
    .get("/api/admin/demo/:id", guard, (c) => c.json({ items: [] }))
    .post("/api/admin/demo/:id", guard, (c) => c.json({ ok: true }))
    .get(
      "/api/admin/own",
      admin({
        permission: "none",
        unhandledMessage: "x",
        logLabel: "[admin/own]",
      }),
      (c) => c.json({}),
    ),
);

let info: ReturnType<typeof vi.spyOn>;

// admin_auth_timing 로그만 골라 JSON 으로 읽는다.
const timingLines = () =>
  info.mock.calls
    .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
    .filter((line) => line.event === "admin_auth_timing");

beforeEach(() => {
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "coupons", level: "edit" }],
  });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin_auth_timing 로그", () => {
  test("성공한 읽기 요청은 경로 패턴과 단계별 시간을 한 줄로 남긴다(QA 확인은 돌지 않아 없다)", async () => {
    const response = await app.request("/api/admin/demo/user-123?q=a@b.c", {
      headers: AUTH,
    });
    expect(response.status).toBe(200);

    const lines = timingLines();
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatchObject({
      event: "admin_auth_timing",
      method: "GET",
      route: "/api/admin/demo/:id",
      status: "ok",
    });
    for (const key of ["getUserMs", "roleMs", "permissionMs", "totalMs"]) {
      expect(line?.[key]).toEqual(expect.any(Number));
    }
    expect(line).not.toHaveProperty("qaMs");
    expect(JSON.stringify(line)).not.toMatch(
      /secret-token|user-123|admin-1|a@b/,
    );
  });

  test("토큰이 없으면 401 이고 돌지 않은 단계는 빠진다", async () => {
    const response = await app.request("/api/admin/demo/1");
    expect(response.status).toBe(401);
    const [line] = timingLines();
    expect(line).toMatchObject({ status: 401 });
    expect(Object.keys(line ?? {}).sort()).toEqual(
      ["event", "method", "route", "status", "totalMs"].sort(),
    );
  });

  test("메뉴 권한이 없으면 403 이고 permissionMs 까지 남긴다", async () => {
    kit.admin = createAdminFake({ permissions: [] });
    const response = await app.request("/api/admin/demo/1", { headers: AUTH });
    expect(response.status).toBe(403);
    const [line] = timingLines();
    expect(line).toMatchObject({ status: 403 });
    expect(line).toHaveProperty("permissionMs");
  });

  test("권한 조회가 실패하면 500 으로 남기고 응답도 500 이다", async () => {
    const fake = createAdminFake({ permissions: [] });
    fake.rpc = () => Promise.resolve({ data: null, error: { message: "x" } });
    kit.admin = fake;
    const response = await app.request("/api/admin/demo/1", { headers: AUTH });
    expect(response.status).toBe(500);
    expect(timingLines()[0]).toMatchObject({ status: 500 });
  });

  test("쓰기 요청은 QA 확인 시간(qaMs)도 남긴다", async () => {
    const response = await app.request("/api/admin/demo/1", {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    expect(timingLines()[0]).toHaveProperty("qaMs");
  });

  test("권한 판정을 건너뛰는 라우트는 permissionMs 가 없다", async () => {
    const response = await app.request("/api/admin/own", { headers: AUTH });
    expect(response.status).toBe(200);
    const lines = timingLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toHaveProperty("permissionMs");
  });
});
