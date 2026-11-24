// GET /api/admin/mentor-applications 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./mentor-applications.js";

let rows: Respond = () => ({ data: [{ id: "m1" }], error: null });

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "mentorApplications", level }] : [],
    tables: { mentor_applications: (query) => rows(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  rows = () => ({ data: [{ id: "m1" }], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/mentor-applications", () => {
  test("view 권한이면 최신순 { items } 를 돌려준다", async () => {
    const admin = setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [{ id: "m1" }] });
    const query = firstQuery(admin, "mentor_applications");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(argsOf(query, "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("쓰기 메서드는 405 이고 쓰지 않는다", async () => {
    const admin = setup("edit");
    const r = await callRoute(handler, { method: "POST", body: {} });
    expect(r.status).toBe(405);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "mentor_applications",
    );
  });

  test("조회 오류는 500 이다", async () => {
    rows = () => ({ data: null, error: { message: "boom" } });
    setup();
    expect((await callRoute(handler)).status).toBe(500);
  });
});
