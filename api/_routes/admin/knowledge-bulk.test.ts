// POST /api/admin/knowledge-bulk 계약 검증. 권한, 본문 검증, 쓰기 컬럼 경계, 404.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  problemCode,
  type Query,
  type Result,
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

import handler from "./knowledge-bulk.js";

const TABLE = "winning_assessment_knowledge_items";
const ROW = {
  grade: "고1",
  subject: "과학",
  title: "제목",
  content: "내용",
};
const BODY = { knowledgeType: "topic_pattern", inserts: [ROW], updates: [] };

const isInsert = (q: Query) => callsOf(q, "insert").length > 0;
const isUpdate = (q: Query) => callsOf(q, "update").length > 0;

// 조회(select 만)는 존재하는 id 를, insert 는 새 id 를, update 는 고친 행을 돌려준다.
let existing: string[] = [];
let updated: Result = { data: [{ id: "u1" }], error: null };
let insertResult: Result = { data: [{ id: "n1" }], error: null };

function setup(
  permissions: { resource_key: string; level: string }[] = [
    { resource_key: "winningSuhaengTopicDb", level: "edit" },
  ],
) {
  kit.admin = createAdminFake({
    permissions,
    tables: {
      [TABLE]: (q) => {
        if (isInsert(q)) return insertResult;
        if (isUpdate(q)) return updated;
        return { data: existing.map((id) => ({ id })), error: null };
      },
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const post = (body: unknown = BODY) =>
  callRoute(handler, { method: "POST", body });

const writes = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.filter(
    (q) => q.table === TABLE && (isInsert(q) || isUpdate(q)),
  );

beforeEach(() => {
  existing = ["u1"];
  updated = { data: [{ id: "u1" }], error: null };
  insertResult = { data: [{ id: "n1" }], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/knowledge-bulk 권한", () => {
  test("edit 권한이면 신규를 넣고 { inserted, updated, ids } 를 돌려준다", async () => {
    setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 1, updated: 0, ids: ["n1"] });
    expect(r.body).not.toHaveProperty("ok");
  });

  test("view 권한만 있으면 403 이고 쓰지 않는다", async () => {
    const admin = setup([
      { resource_key: "winningSuhaengTopicDb", level: "view" },
    ]);
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(writes(admin)).toEqual([]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    const admin = setup([]);
    expect(problemCode((await post()).body)).toBe("FORBIDDEN");
    expect(writes(admin)).toEqual([]);
  });

  test("다른 타입 메뉴의 권한만 있으면 403 이고 쓰지 않는다", async () => {
    const admin = setup([
      { resource_key: "winningSuhaengResourceDb", level: "edit" },
    ]);
    expect((await post()).status).toBe(403);
    expect(writes(admin)).toEqual([]);
  });

  test("모르는 knowledgeType 은 400 VALIDATION_FAILED 다", async () => {
    setup([]);
    const r = await post({ ...BODY, knowledgeType: "other" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });
});

describe("POST /api/admin/knowledge-bulk 본문 검증", () => {
  test.each([
    ["행이 하나도 없음", { ...BODY, inserts: [] }],
    ["필수값이 빈 신규", { ...BODY, inserts: [{ ...ROW, title: " " }] }],
    ["id 가 없는 수정", { ...BODY, inserts: [], updates: [{ title: "x" }] }],
    ["컬럼이 아닌 키", { ...BODY, inserts: [{ ...ROW, titel: "x" }] }],
    ["본문 없음", null],
  ])("%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_label, body) => {
    const admin = setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.filter((q) => q.table === TABLE)).toEqual([]);
  });
});

describe("POST /api/admin/knowledge-bulk 쓰기 경계", () => {
  test("insert 는 knowledge_type 을 요청 타입으로 덮고 embedding, search_text, id 를 싣지 않는다", async () => {
    const admin = setup();
    await post({
      knowledgeType: "topic_pattern",
      inserts: [
        {
          ...ROW,
          knowledge_type: "verified_resource",
          embedding: "[1,2]",
          search_text: "x",
          embedding_error: "e",
          id: "forced",
          created_at: "2020-01-01",
        },
      ],
      updates: [],
    });
    const [insert] = writes(admin);
    expect(argsOf(insert as Query, "insert")).toEqual([
      [
        {
          ...ROW,
          knowledge_type: "topic_pattern",
          embedding_status: "pending",
          embedding_error: null,
        },
      ],
    ]);
  });

  test("update 는 고정 타입 조건으로 걸고 embedding, search_text 를 싣지 않고 pending 으로 돌린다", async () => {
    const admin = setup();
    const r = await post({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [
        {
          id: "u1",
          title: "새 제목",
          embedding: "[1]",
          search_text: "x",
          knowledge_type: "verified_resource",
        },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ inserted: 0, updated: 1, ids: ["u1"] });
    const update = writes(admin)[0] as Query;
    expect(argsOf(update, "update")).toEqual([
      {
        title: "새 제목",
        knowledge_type: "topic_pattern",
        embedding_status: "pending",
        embedding_error: null,
      },
    ]);
    expect(callsOf(update, "eq").map((c) => c.args)).toEqual([
      ["id", "u1"],
      ["knowledge_type", "topic_pattern"],
    ]);
  });

  test("삭제는 하지 않는다", async () => {
    const admin = setup();
    await post();
    expect(admin.queries.some((q) => callsOf(q, "delete").length > 0)).toBe(
      false,
    );
  });

  test("수정 대상이 이 메뉴에 없으면 404 NOT_FOUND 이고 아무것도 쓰지 않는다", async () => {
    existing = [];
    const admin = setup();
    const r = await post({
      knowledgeType: "topic_pattern",
      inserts: [ROW],
      updates: [{ id: "other-menu", title: "x" }],
    });
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "이 메뉴에 없는 id 가 있습니다: other-menu",
    );
    expect(writes(admin)).toEqual([]);
  });

  test("확인과 수정 사이에 행이 사라져 update 가 0행이면 404 NOT_FOUND 다", async () => {
    updated = { data: [], error: null };
    setup();
    const r = await post({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [{ id: "u1", title: "x" }],
    });
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("insert DB 오류는 500 INTERNAL_ERROR 다", async () => {
    insertResult = { data: null, error: { message: "boom" } };
    setup();
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
