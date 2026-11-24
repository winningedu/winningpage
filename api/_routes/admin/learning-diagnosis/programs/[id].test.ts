// PATCH, DELETE /api/admin/learning-diagnosis/programs/:id 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./[id].js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const BODY = {
  title: "프로그램",
  badge: "",
  description: "",
  primary_button_text: "",
  primary_button_link: "",
  secondary_button_text: "",
  secondary_button_link: "",
  icon: "target",
  is_active: true,
  sort_order: 1,
};

let rows: Respond = () => ({ data: { id: "o1" }, error: null });

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "learningDiagnosis", level }] : [],
    tables: { learning_diagnosis_programs: (query) => rows(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  rows = () => ({ data: { id: "o1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/learning-diagnosis/programs/:id", () => {
  const patch = (body: unknown = BODY) =>
    callRoute(handler, { method: "PATCH", query: { id: ID }, body });

  test("id 행만 고친다", async () => {
    const admin = setup();
    expect((await patch()).status).toBe(200);
    const query = firstQuery(admin, "learning_diagnosis_programs");
    expect(argsOf(query, "update")).toEqual([BODY]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("닿은 행이 없으면 404 NOT_FOUND 다", async () => {
    rows = () => ({ data: null, error: null });
    setup();
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이다", async () => {
    setup("view");
    expect((await patch()).status).toBe(403);
  });

  test.each([
    ["빈 제목", { ...BODY, title: "" }],
    ["알 수 없는 키", { ...BODY, service_link: "x" }],
  ])("%s 는 400 이다", async (_l, body) => {
    setup();
    expect((await patch(body)).status).toBe(400);
  });
});

describe("DELETE /api/admin/learning-diagnosis/programs/:id", () => {
  const del = () => callRoute(handler, { method: "DELETE", query: { id: ID } });

  test("지우고 204 다", async () => {
    rows = () => ({ data: [{ id: ID }], error: null });
    setup();
    expect((await del()).status).toBe(204);
  });

  test("지운 행이 없으면 404 다", async () => {
    rows = () => ({ data: [], error: null });
    setup();
    expect((await del()).status).toBe(404);
  });

  test("view 권한이면 403 이다", async () => {
    setup("view");
    expect((await del()).status).toBe(403);
  });
});
