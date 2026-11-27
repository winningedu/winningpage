// /api/admin/tenants 아래 글자 그대로인 경로가 /:id 의 405 에 가로채이지 않는지 루트 앱에서 본다.
// 하위 앱을 붙이는 순서(api/_routes/admin/app.ts)가 바뀌면 .all("/:id", methodNotAllowed(...)) 가 /member-purge 같은 경로를 405 로 답한다.

import { describe, expect, test, vi } from "vitest";
import { createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const TENANT = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";

// 권한 행이 없는 관리자라 405 로 가로채이지 않은 요청은 모두 403 으로 끝난다.
function send(method: string, path: string) {
  kit.admin = createAdminFake({ permissions: [] });
  return app.request(path, {
    method,
    headers: { authorization: "Bearer token" },
  });
}

const LITERAL_PATHS = [
  ["POST", "/api/admin/tenants/member-purge"],
  ["GET", "/api/admin/tenants/member-purge-preview"],
  ["GET", "/api/admin/tenants/purge-logs"],
  ["POST", "/api/admin/tenants/school-admin"],
  ["GET", "/api/admin/tenants/school-admins"],
  ["POST", "/api/admin/tenants/move-student"],
  ["GET", "/api/admin/tenants/student-usage"],
  ["PUT", "/api/admin/tenants/student-usage"],
] as const;

describe("기관 경로: 글자 그대로인 경로가 /:id 보다 먼저다", () => {
  test.each(LITERAL_PATHS)(
    "%s %s 는 자기 라우트에 닿아 405 가 아니다",
    async (method, path) => {
      const response = await send(method, path);

      expect(response.status).toBe(403);
    },
  );

  test.each([
    ["GET", "/api/admin/tenants/member-purge", "POST"],
    ["POST", "/api/admin/tenants/member-purge-preview", "GET, HEAD"],
    ["DELETE", "/api/admin/tenants/student-usage", "GET, HEAD, PUT"],
    ["GET", "/api/admin/tenants/school-admin", "POST"],
  ])("%s %s 는 그 경로의 Allow 로 405 다", async (method, path, allow) => {
    const response = await send(method, path);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe(allow);
  });

  test("uuid 는 /:id 에, /:id/service-settings 는 서비스 설정에 닿는다", async () => {
    expect((await send("GET", `/api/admin/tenants/${TENANT}`)).status).toBe(
      403,
    );
    expect(
      (await send("GET", `/api/admin/tenants/${TENANT}/service-settings`))
        .status,
    ).toBe(403);
    expect((await send("GET", "/api/admin/tenants")).status).toBe(403);
  });

  test("/:id 는 GET, PATCH 만 받는다", async () => {
    const response = await send("DELETE", `/api/admin/tenants/${TENANT}`);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, PATCH");
  });
});
