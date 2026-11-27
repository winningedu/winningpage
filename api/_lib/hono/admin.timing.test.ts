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
    .post("/api/admin/demo/:id", guard, (c) => c.json({ ok: true })),
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
});
