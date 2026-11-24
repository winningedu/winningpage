// PATCH, DELETE /api/admin/learning-diagnosis/questions/:id 계약 검증.

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
  title: " 질문 ",
  description: "",
  input_type: "multiple",
  is_required: false,
  is_active: true,
  sort_order: 2,
};

let questions: Respond = () => ({ data: { id: ID }, error: null });

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "learningDiagnosis", level }] : [],
    tables: { learning_diagnosis_questions: (query) => questions(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  questions = () => ({ data: { id: ID }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/learning-diagnosis/questions/:id", () => {
  const patch = (body: unknown = BODY, query = { id: ID }) =>
    callRoute(handler, { method: "PATCH", query, body });

  test("edit 권한이면 id 행만 고쳐 돌려준다", async () => {
    const admin = setup();
    const r = await patch();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ID });
    const query = firstQuery(admin, "learning_diagnosis_questions");
    expect(argsOf(query, "update")).toEqual([{ ...BODY, title: "질문" }]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("닿은 행이 없으면 404 NOT_FOUND 다", async () => {
    questions = () => ({ data: null, error: null });
    setup();
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await patch();
    expect(r.status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_questions",
    );
  });

  test("권한 행이 없으면 403 이다", async () => {
    setup(null);
    expect((await patch()).status).toBe(403);
  });

  test.each([
    ["알 수 없는 키", { ...BODY, question_key: "k" }],
    ["빈 제목", { ...BODY, title: "" }],
  ])("%s 는 400 이다", async (_l, body) => {
    setup();
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test("uuid 가 아닌 id 는 400 이다", async () => {
    setup();
    expect((await patch(BODY, { id: "abc" })).status).toBe(400);
  });
});

describe("DELETE /api/admin/learning-diagnosis/questions/:id", () => {
  const del = (query = { id: ID }) =>
    callRoute(handler, { method: "DELETE", query });

  test("edit 권한이면 지우고 204 다", async () => {
    questions = () => ({ data: [{ id: ID }], error: null });
    const admin = setup();
    const r = await del();
    expect(r.status).toBe(204);
    const query = firstQuery(admin, "learning_diagnosis_questions");
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("지운 행이 없으면 404 다", async () => {
    questions = () => ({ data: [], error: null });
    setup();
    const r = await del();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이다", async () => {
    setup("view");
    expect((await del()).status).toBe(403);
  });
});
