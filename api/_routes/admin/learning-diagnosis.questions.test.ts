// GET, POST /api/admin/learning-diagnosis/questions 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
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

import { app } from "../app.js";

const handler = { app, path: "/api/admin/learning-diagnosis/questions" };

const ROW = { id: "q1", title: "질문", input_type: "single" };
const BODY = {
  title: " 질문 ",
  description: "",
  input_type: "single",
  is_required: true,
  is_active: true,
  sort_order: 3,
};

let questions: Respond = () => ({ data: [ROW], error: null });

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "learningDiagnosis", level }] : [],
    tables: { learning_diagnosis_questions: (query) => questions(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  questions = () => ({ data: [ROW], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/learning-diagnosis/questions", () => {
  test("view 권한이면 sort_order, created_at 순으로 { items } 를 돌려준다", async () => {
    const admin = setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [ROW] });
    const query = firstQuery(admin, "learning_diagnosis_questions");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(callsOf(query, "order").map((c) => c.args[0])).toEqual([
      "sort_order",
      "created_at",
    ]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("조회 오류는 500 이다", async () => {
    questions = () => ({ data: null, error: { message: "boom" } });
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(500);
  });
});

describe("POST /api/admin/learning-diagnosis/questions", () => {
  const post = (body: unknown) => callRoute(handler, { method: "POST", body });

  test("edit 권한이면 제목을 다듬어 저장하고 201 로 행을 돌려준다", async () => {
    questions = () => ({ data: ROW, error: null });
    const admin = setup("edit");
    const r = await post(BODY);
    expect(r.status).toBe(201);
    expect(r.body).toEqual(ROW);
    const query = firstQuery(admin, "learning_diagnosis_questions");
    expect(argsOf(query, "insert")).toEqual([{ ...BODY, title: "질문" }]);
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post(BODY);
    expect(r.status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_questions",
    );
  });

  test.each([
    ["빈 제목", { ...BODY, title: "   " }],
    ["알 수 없는 input_type", { ...BODY, input_type: "x" }],
    ["알 수 없는 키", { ...BODY, question_key: "k" }],
    ["정수가 아닌 sort_order", { ...BODY, sort_order: 1.5 }],
    ["빠진 필드", { title: "질문" }],
  ])("%s 는 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_l, body) => {
    const admin = setup("edit");
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_questions",
    );
  });
});
