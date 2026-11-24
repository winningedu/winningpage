// GET, PATCH /api/admin/mentor-applications/:id 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./[id].js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
let rows: Respond = () => ({
  data: { id: ID, status: "screening" },
  error: null,
});

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "mentorApplications", level }] : [],
    tables: { mentor_applications: (query) => rows(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  rows = () => ({ data: { id: ID, status: "screening" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/mentor-applications/:id", () => {
  const get = (query: Record<string, string> = { id: ID }) =>
    callRoute(handler, { query });

  test("view 권한이면 id 로 한 건을 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ID, status: "screening" });
    expect(argsOf(firstQuery(admin, "mentor_applications"), "eq")).toEqual([
      "id",
      ID,
    ]);
  });

  test("없는 신청은 404 NOT_FOUND 다", async () => {
    rows = () => ({ data: null, error: null });
    setup();
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("uuid 가 아닌 id 는 400 이다", async () => {
    setup();
    expect((await get({ id: "abc" })).status).toBe(400);
  });

  test("권한 행이 없으면 403 이다", async () => {
    setup(null);
    expect((await get()).status).toBe(403);
  });
});

describe("PATCH /api/admin/mentor-applications/:id", () => {
  const patch = (body: unknown = { status: "interview" }, query = { id: ID }) =>
    callRoute(handler, { method: "PATCH", query, body });

  test("edit 권한이면 status 만 써서 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await patch();
    expect(r.status).toBe(200);
    const query = firstQuery(admin, "mentor_applications");
    expect(argsOf(query, "update")).toEqual([{ status: "interview" }]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("닿은 행이 없으면 404 NOT_FOUND 다", async () => {
    rows = () => ({ data: null, error: null });
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    expect((await patch()).status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "mentor_applications",
    );
  });

  test.each([
    ["알 수 없는 상태 값", { status: "hired" }],
    ["다른 컬럼", { status: "active", name: "x" }],
    ["빈 본문", {}],
  ])("%s 는 400 이고 쓰지 않는다", async (_l, body) => {
    const admin = setup("edit");
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "mentor_applications",
    );
  });
});
