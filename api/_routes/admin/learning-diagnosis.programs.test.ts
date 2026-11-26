// GET, POST /api/admin/learning-diagnosis/programs 계약 검증.

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

const handler = { app, path: "/api/admin/learning-diagnosis/programs" };

const BODY = {
  title: " 프로그램 ",
  badge: "추천 서비스",
  description: "",
  primary_button_text: "서비스 확인하기",
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

describe("GET /api/admin/learning-diagnosis/programs", () => {
  test("view 권한이면 정렬한 { items } 를 돌려준다", async () => {
    rows = () => ({ data: [{ id: "o1" }], error: null });
    const admin = setup("view");
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [{ id: "o1" }] });
    expect(
      callsOf(firstQuery(admin, "learning_diagnosis_programs"), "order").map(
        (c) => c.args[0],
      ),
    ).toEqual(["sort_order", "created_at"]);
  });

  test("권한 행이 없으면 403 이다", async () => {
    setup(null);
    expect((await callRoute(handler)).status).toBe(403);
  });
});

describe("POST /api/admin/learning-diagnosis/programs", () => {
  const post = (body: unknown) => callRoute(handler, { method: "POST", body });

  test("제목을 다듬어 201 로 저장한다", async () => {
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(201);
    expect(
      argsOf(firstQuery(admin, "learning_diagnosis_programs"), "insert"),
    ).toEqual([{ ...BODY, title: "프로그램" }]);
  });

  test("view 권한이면 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    expect((await post(BODY)).status).toBe(403);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_programs",
    );
  });

  test.each([
    ["빈 제목", { ...BODY, title: " " }],
    ["알 수 없는 키", { ...BODY, program_key: "k" }],
    ["문자열 sort_order", { ...BODY, sort_order: "1" }],
  ])("%s 는 400 이고 쓰지 않는다", async (_l, body) => {
    const admin = setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "learning_diagnosis_programs",
    );
  });
});
