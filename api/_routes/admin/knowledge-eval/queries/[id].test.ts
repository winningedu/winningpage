// PATCH /api/admin/knowledge-eval/queries/:id 계약 검증. 질의 수정과 비활성 토글.

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
vi.mock("../../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => null,
}));

import handler from "./[id].js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const R1 = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

const FORM = {
  grade: "고1",
  subject: "통합과학",
  career: null,
  selected_topic: "마찰",
  assessment_info: null,
  note: null,
  expected_resource_ids: [R1],
};
const ROW = {
  id: ID,
  knowledge_type: "topic_pattern",
  ...FORM,
  is_active: true,
};
const COLUMNS =
  "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids, is_active, created_at";

let table: Respond;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "knowledgeEvals", level }] : [],
    tables: { knowledge_golden_queries: (query) => table(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const patch = (
  body: unknown = FORM,
  query: Record<string, string> = {
    id: ID,
    knowledgeType: "topic_pattern",
  },
) => callRoute(handler, { method: "PATCH", query, body });

const wrote = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.map((q) => q.table).includes("knowledge_golden_queries");

beforeEach(() => {
  table = () => ({ data: ROW, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/admin/knowledge-eval/queries/:id", () => {
  test("edit 권한이면 폼 필드를 고치고 고쳐진 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await patch();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
    const query = firstQuery(admin, "knowledge_golden_queries");
    expect(argsOf(query, "update")).toEqual([FORM]);
    expect(argsOf(query, "select")).toEqual([COLUMNS]);
  });

  test("id 와 지식 유형으로 범위를 좁혀 고친다", async () => {
    const admin = setup("edit");
    await patch();
    const query = firstQuery(admin, "knowledge_golden_queries");
    expect(
      query.calls.filter((c) => c.method === "eq").map((c) => c.args),
    ).toEqual([
      ["id", ID],
      ["knowledge_type", "topic_pattern"],
    ]);
  });

  test("is_active 만 보내면 그 한 열만 고친다(비활성 토글)", async () => {
    const admin = setup("edit");
    const r = await patch({ is_active: false });
    expect(r.status).toBe(200);
    expect(
      argsOf(firstQuery(admin, "knowledge_golden_queries"), "update"),
    ).toEqual([{ is_active: false }]);
  });

  test("폼 필드와 is_active 를 함께 보내도 된다", async () => {
    const admin = setup("edit");
    const r = await patch({ ...FORM, is_active: true });
    expect(r.status).toBe(200);
    expect(
      argsOf(firstQuery(admin, "knowledge_golden_queries"), "update"),
    ).toEqual([{ ...FORM, is_active: true }]);
  });

  test("view 권한으로는 403 FORBIDDEN 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await patch();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(wrote(admin)).toBe(false);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    expect((await patch()).status).toBe(403);
  });

  test("범위에 맞는 행이 없으면 404 NOT_FOUND 다", async () => {
    table = () => ({ data: null, error: null });
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test.each([
    [
      "knowledge_type(유형은 옮기지 않는다)",
      { knowledge_type: "verified_resource" },
    ],
    ["id", { id: ID }],
    ["created_at", { created_at: "2026-10-07T00:00:00Z" }],
    ["created_by", { created_by: R1 }],
    ["테이블에 없는 키", { extra: 1 }],
  ])(
    "폼에 없는 키 %s 를 보내면 400 VALIDATION_FAILED 이고 쓰지 않는다",
    async (_label, extra) => {
      const admin = setup("edit");
      const r = await patch({ ...FORM, ...extra });
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(wrote(admin)).toBe(false);
    },
  );

  test.each([
    ["빈 본문", {}],
    ["빈 grade", { grade: "" }],
    ["기대 자료 0개", { expected_resource_ids: [] }],
    ["uuid 가 아닌 기대 자료", { expected_resource_ids: ["abc"] }],
    ["boolean 이 아닌 is_active", { is_active: "no" }],
    ["본문이 null", null],
  ])("%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_label, body) => {
    const admin = setup("edit");
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(wrote(admin)).toBe(false);
  });

  test.each([
    ["id 가 uuid 가 아님", { id: "abc", knowledgeType: "topic_pattern" }],
    ["knowledgeType 없음", { id: ID }],
    ["모르는 knowledgeType", { id: ID, knowledgeType: "other" }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다",
    async (_label, query) => {
      const admin = setup("edit");
      const r = await patch(FORM, query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(wrote(admin)).toBe(false);
    },
  );

  test("GET 과 DELETE 는 405 이고 아무것도 읽거나 쓰지 않는다", async () => {
    const admin = setup("edit");
    for (const method of ["GET", "DELETE"]) {
      const r = await callRoute(handler, {
        method,
        query: { id: ID, knowledgeType: "topic_pattern" },
      });
      expect(r.status).toBe(405);
    }
    expect(admin.queries).toEqual([]);
  });

  test("DB 오류는 500 INTERNAL_ERROR 다", async () => {
    table = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
