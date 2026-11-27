// GET, POST /api/admin/knowledge-eval/queries 계약 검증. 기준 문제집 목록과 질의 추가.

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
vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => null,
}));

import {
  goldenList,
  goldenQuery,
} from "../../../shared/knowledge-eval/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/knowledge-eval/queries" };

const R1 = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const R2 = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

const INPUT = {
  knowledge_type: "topic_pattern",
  grade: "고2",
  subject: "물리학",
  career: null,
  selected_topic: "마찰력 실험",
  assessment_info: null,
  note: null,
  expected_resource_ids: [R1, R2],
};
const ROW = {
  id: "q1",
  ...INPUT,
  is_active: true,
  created_at: "2026-10-07T00:00:00Z",
};

const COLUMNS =
  "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids, is_active, created_at";

let table: Respond;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "knowledgeEvals", level }] : [],
    tables: { knowledge_golden_queries: (query) => table(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const get = (
  query: Record<string, string> = { knowledgeType: "topic_pattern" },
) => callRoute(handler, { query });
const post = (body: unknown = INPUT) =>
  callRoute(handler, { method: "POST", body });

const wrote = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.map((q) => q.table).includes("knowledge_golden_queries");

beforeEach(() => {
  table = () => ({ data: [ROW], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/knowledge-eval/queries", () => {
  test("view 권한이면 그 유형의 질의를 { items } 로 돌려주고 옛 화면과 같은 열과 정렬로 읽는다", async () => {
    const admin = setup("view");
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [ROW] });
    expect(goldenList.parse(r.body)).toEqual(r.body);
    const query = firstQuery(admin, "knowledge_golden_queries");
    expect(argsOf(query, "select")).toEqual([COLUMNS]);
    expect(argsOf(query, "eq")).toEqual(["knowledge_type", "topic_pattern"]);
    expect(
      query.calls.filter((c) => c.method === "order").map((c) => c.args),
    ).toEqual([
      ["is_active", { ascending: false }],
      ["created_at", { ascending: true }],
    ]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test.each([
    ["knowledgeType 없음", {}],
    ["모르는 knowledgeType", { knowledgeType: "other" }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 읽지 않는다",
    async (_label, query) => {
      const admin = setup("view");
      const r = await get(query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(wrote(admin)).toBe(false);
    },
  );

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    table = () => ({ data: null, error: { message: "boom" } });
    setup("view");
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/admin/knowledge-eval/queries", () => {
  test("view 권한으로는 403 FORBIDDEN 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(wrote(admin)).toBe(false);
  });

  test("edit 권한이면 화면 폼 필드만 넣고 201 로 만든 행을 돌려준다", async () => {
    table = () => ({ data: ROW, error: null });
    const admin = setup("edit");
    const r = await post();
    expect(r.status).toBe(201);
    expect(r.body).toEqual(ROW);
    expect(goldenQuery.parse(r.body)).toEqual(r.body);
    const query = firstQuery(admin, "knowledge_golden_queries");
    expect(argsOf(query, "insert")).toEqual([INPUT]);
    expect(argsOf(query, "select")).toEqual([COLUMNS]);
  });

  test.each([
    ["id", { id: R1 }],
    ["created_at", { created_at: "2026-10-07T00:00:00Z" }],
    ["is_active", { is_active: false }],
    ["created_by", { created_by: R1 }],
    ["테이블에 없는 키", { extra: 1 }],
  ])(
    "폼에 없는 키 %s 를 보내면 400 VALIDATION_FAILED 이고 쓰지 않는다",
    async (_label, extra) => {
      const admin = setup("edit");
      const r = await post({ ...INPUT, ...extra });
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(wrote(admin)).toBe(false);
    },
  );

  test.each([
    ["빈 grade", { grade: "" }],
    ["빈 subject", { subject: "" }],
    ["모르는 knowledge_type", { knowledge_type: "other" }],
    ["기대 자료 0개", { expected_resource_ids: [] }],
    ["uuid 가 아닌 기대 자료", { expected_resource_ids: ["abc"] }],
    ["문자열이 아닌 note", { note: 3 }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다",
    async (_label, patch) => {
      const admin = setup("edit");
      const r = await post({ ...INPUT, ...patch });
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(wrote(admin)).toBe(false);
    },
  );

  test("본문이 null 이면 400 VALIDATION_FAILED 다", async () => {
    setup("edit");
    const r = await post(null);
    expect(r.status).toBe(400);
  });

  test("DB 오류는 500 INTERNAL_ERROR 다", async () => {
    table = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
