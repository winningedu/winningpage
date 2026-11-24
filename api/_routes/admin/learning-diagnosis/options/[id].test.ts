// PATCH, DELETE /api/admin/learning-diagnosis/options/:id 계약 검증.

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
  label: "답변",
  program_ids: ["p1"],
  is_active: true,
  sort_order: 2,
};

let rows: Respond = () => ({ data: { id: "o1" }, error: null });

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "learningDiagnosis", level }] : [],
    tables: { learning_diagnosis_options: (query) => rows(query) },
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

describe("PATCH /api/admin/learning-diagnosis/options/:id", () => {
  const patch = (body: unknown = BODY, query = { id: ID }) =>
    callRoute(handler, { method: "PATCH", query, body });

  test("label 을 option_text 에 미러링해 id 행만 고친다", async () => {
    const admin = setup();
    const r = await patch();
    expect(r.status).toBe(200);
    const query = firstQuery(admin, "learning_diagnosis_options");
    expect(argsOf(query, "update")).toEqual([{ ...BODY, option_text: "답변" }]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("닿은 행이 없으면 404 NOT_FOUND 다", async () => {
    rows = () => ({ data: null, error: null });
    setup();
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    expect((await patch()).status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_options",
    );
  });

  test.each([
    ["빈 label", { ...BODY, label: "  " }],
    ["question_id 쓰기", { ...BODY, question_id: ID }],
    ["option_text 쓰기", { ...BODY, option_text: "a" }],
  ])("%s 는 400 이다", async (_l, body) => {
    setup();
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });
});

describe("DELETE /api/admin/learning-diagnosis/options/:id", () => {
  const del = () => callRoute(handler, { method: "DELETE", query: { id: ID } });

  test("지우고 204 다", async () => {
    rows = () => ({ data: [{ id: ID }], error: null });
    const admin = setup();
    expect((await del()).status).toBe(204);
    expect(
      argsOf(firstQuery(admin, "learning_diagnosis_options"), "eq"),
    ).toEqual(["id", ID]);
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
