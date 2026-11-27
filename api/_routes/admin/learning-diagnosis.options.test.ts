// GET, POST /api/admin/learning-diagnosis/options 계약 검증.

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

const handler = { app, path: "/api/admin/learning-diagnosis/options" };

const QID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const BODY = {
  question_id: QID,
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

describe("GET /api/admin/learning-diagnosis/options", () => {
  test("view 권한이면 정렬한 { items } 를 돌려준다", async () => {
    rows = () => ({ data: [{ id: "o1" }], error: null });
    const admin = setup("view");
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [{ id: "o1" }] });
    const query = firstQuery(admin, "learning_diagnosis_options");
    expect(callsOf(query, "order").map((c) => c.args[0])).toEqual([
      "sort_order",
      "created_at",
    ]);
  });

  test("권한 행이 없으면 403 이다", async () => {
    setup(null);
    expect((await callRoute(handler)).status).toBe(403);
  });
});

describe("POST /api/admin/learning-diagnosis/options", () => {
  const post = (body: unknown) => callRoute(handler, { method: "POST", body });

  test("legacy option_text 를 label 과 같게 채워 201 로 저장한다", async () => {
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: "o1" });
    const query = firstQuery(admin, "learning_diagnosis_options");
    expect(argsOf(query, "insert")).toEqual([{ ...BODY, option_text: "답변" }]);
  });

  test("빈 label 로 만들 수 있다(화면이 빈 답변을 먼저 만든다)", async () => {
    const admin = setup();
    const r = await post({ ...BODY, label: "" });
    expect(r.status).toBe(201);
    expect(
      argsOf(firstQuery(admin, "learning_diagnosis_options"), "insert"),
    ).toEqual([{ ...BODY, label: "", option_text: "" }]);
  });

  test("없는 질문(FK 23503)은 404 NOT_FOUND 다", async () => {
    rows = () => ({ data: null, error: { code: "23503", message: "fk" } });
    setup();
    const r = await post(BODY);
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    expect((await post(BODY)).status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_options",
    );
  });

  test.each([
    ["uuid 가 아닌 question_id", { ...BODY, question_id: "x" }],
    ["option_text 직접 지정", { ...BODY, option_text: "a" }],
    ["program_ids 가 문자열", { ...BODY, program_ids: "p1" }],
    ["알 수 없는 키", { ...BODY, question_key: "k" }],
  ])("%s 는 400 이고 쓰지 않는다", async (_l, body) => {
    const admin = setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_options",
    );
  });
});
