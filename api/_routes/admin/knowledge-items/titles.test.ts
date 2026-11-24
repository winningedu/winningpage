// GET /api/admin/knowledge-items/titles 계약 검증. 기대 자료 제목 조회와 제목 검색, 읽기 전용.

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
vi.mock("../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => null,
}));

import handler from "./titles.js";

const A = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const B = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

let table: Respond;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "knowledgeEvals", level }] : [],
    tables: { winning_assessment_knowledge_items: (query) => table(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const get = (query: Record<string, string>) => callRoute(handler, { query });
const read = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.filter((q) => q.table === "winning_assessment_knowledge_items");

beforeEach(() => {
  table = () => ({
    data: [
      { id: A, title: "자료 하나" },
      { id: B, title: null },
    ],
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/knowledge-items/titles ids 모드", () => {
  test("view 권한이면 id 와 title 만 { items } 로 돌려주고 title 이 비면 빈 문자열이다", async () => {
    const admin = setup("view");
    const r = await get({ ids: `${A},${B}` });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        { id: A, title: "자료 하나" },
        { id: B, title: "" },
      ],
    });
    const query = firstQuery(admin, "winning_assessment_knowledge_items");
    expect(argsOf(query, "select")).toEqual(["id, title"]);
    expect(argsOf(query, "in")).toEqual(["id", [A, B]]);
    expect(argsOf(query, "eq")).toBeUndefined();
  });

  test("같은 id 는 한 번만 조회한다", async () => {
    const admin = setup();
    await get({ ids: `${A},${A},${B}` });
    expect(
      argsOf(firstQuery(admin, "winning_assessment_knowledge_items"), "in"),
    ).toEqual(["id", [A, B]]);
  });

  test("200개까지는 되고 201개는 400 VALIDATION_FAILED 다", async () => {
    const admin = setup();
    const make = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ).join(",");
    expect((await get({ ids: make(200) })).status).toBe(200);
    const over = await get({ ids: make(201) });
    expect(over.status).toBe(400);
    expect(problemCode(over.body)).toBe("VALIDATION_FAILED");
    expect(read(admin)).toHaveLength(1);
  });

  test.each([
    ["uuid 가 아닌 id", { ids: "abc" }],
    ["빈 ids", { ids: "" }],
    [
      "ids 와 knowledgeType 을 함께",
      { ids: A, knowledgeType: "topic_pattern" },
    ],
    ["ids 와 q 를 함께", { ids: A, q: "마찰" }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 읽지 않는다",
    async (_label, query) => {
      const admin = setup();
      const r = await get(query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(read(admin)).toHaveLength(0);
    },
  );
});

describe("GET /api/admin/knowledge-items/titles 검색 모드", () => {
  test("지식 유형으로 좁혀 제목 ilike, 제목순, 20건으로 읽는다", async () => {
    const admin = setup();
    const r = await get({ knowledgeType: "verified_resource", q: " 마찰 " });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        { id: A, title: "자료 하나" },
        { id: B, title: "" },
      ],
    });
    const query = firstQuery(admin, "winning_assessment_knowledge_items");
    expect(argsOf(query, "select")).toEqual(["id, title"]);
    expect(argsOf(query, "eq")).toEqual([
      "knowledge_type",
      "verified_resource",
    ]);
    expect(argsOf(query, "ilike")).toEqual(["title", "%마찰%"]);
    expect(argsOf(query, "order")).toEqual(["title"]);
    expect(argsOf(query, "limit")).toEqual([20]);
  });

  test("ilike 특수문자 % _ \\ 는 이스케이프한다", async () => {
    const admin = setup();
    await get({ knowledgeType: "topic_pattern", q: "100%_a\\b" });
    expect(
      argsOf(firstQuery(admin, "winning_assessment_knowledge_items"), "ilike"),
    ).toEqual(["title", "%100\\%\\_a\\\\b%"]);
  });

  test("빈 q 나 공백 q 는 조회 없이 빈 items 다", async () => {
    const admin = setup();
    for (const q of ["", "   "]) {
      const r = await get({ knowledgeType: "topic_pattern", q });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ items: [] });
    }
    expect((await get({ knowledgeType: "topic_pattern" })).body).toEqual({
      items: [],
    });
    expect(read(admin)).toHaveLength(0);
  });

  test("모르는 knowledgeType 은 400 VALIDATION_FAILED 이다", async () => {
    setup();
    const r = await get({ knowledgeType: "other", q: "x" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/admin/knowledge-items/titles 공통", () => {
  test("두 모드를 모두 안 쓰면 400 VALIDATION_FAILED 다", async () => {
    setup();
    const r = await get({});
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이고 읽지 않는다", async () => {
    const admin = setup(null);
    const r = await get({ ids: A });
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(read(admin)).toHaveLength(0);
  });

  test("다른 메뉴의 권한만 있으면 403 이다", async () => {
    kit.admin = createAdminFake({
      permissions: [{ resource_key: "winningSuhaengTopicDb", level: "edit" }],
    });
    expect((await get({ ids: A })).status).toBe(403);
  });

  test("POST 는 405 다", async () => {
    setup("edit");
    const r = await callRoute(handler, { method: "POST", query: { ids: A } });
    expect(r.status).toBe(405);
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    table = () => ({ data: null, error: { message: "boom" } });
    setup();
    const r = await get({ ids: A });
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
