// POST /api/admin/knowledge-search 계약 검증. 읽기 POST 라 view 권한이면 된다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { searchPreviewResultSchema } from "../../../shared/knowledge/contract.js";
import {
  callRoute,
  createAdminFake,
  problemCode,
  type Result,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  embedded: [] as string[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));
vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => null,
}));
vi.mock("../../_lib/afterResponse.js", () => ({
  scheduleAfterResponse: () => {},
}));
vi.mock("../../_lib/ai/telemetry/trace.js", () => ({
  createAiTrace: () => ({ flush: async () => ({ ok: true }) }),
}));
vi.mock("../../_lib/performance/embeddings.js", () => ({
  embedText: vi.fn(async (text: string) => {
    kit.embedded.push(text);
    return [0.1, 0.2];
  }),
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/knowledge-search" };

const BODY = {
  knowledgeType: "topic_pattern",
  grade: "2",
  subject: "수학",
  career: "의사",
};

let rpcResult: Result = { data: [], error: null };

function setup(
  permissions: { resource_key: string; level: string }[] = [
    { resource_key: "winningSuhaengTopicDb", level: "view" },
  ],
) {
  kit.admin = createAdminFake({
    permissions,
    rpcs: {
      match_winning_suhaeng_hybrid: () => rpcResult,
      match_winning_suhaeng_all_subjects: () => rpcResult,
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const post = (body: unknown = BODY) =>
  callRoute(route, { method: "POST", body });

beforeEach(() => {
  rpcResult = { data: [], error: null };
  kit.embedded.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/knowledge-search", () => {
  test("view 권한이면 ok 없이 mode, threshold, queryText, keywordQuery, items 를 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      mode: "hybrid",
      threshold: expect.any(Number),
      queryText: expect.any(String),
      keywordQuery: expect.anything(),
      items: [],
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(admin.rpcCalls[0]?.name).toBe("match_winning_suhaeng_hybrid");
    expect(kit.embedded).toHaveLength(1);
    expect(searchPreviewResultSchema.safeParse(r.body).success).toBe(true);
  });

  test("vector 모드는 keywordQuery 가 null 이다", async () => {
    setup();
    const r = await post({ ...BODY, mode: "vector" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mode: "vector", keywordQuery: null });
  });

  test("권한 행이 없으면 403 FORBIDDEN 이고 임베딩을 쓰지 않는다", async () => {
    setup([]);
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(kit.embedded).toEqual([]);
  });

  test("다른 타입 메뉴의 권한만 있으면 403 이다", async () => {
    setup([{ resource_key: "winningSuhaengResourceDb", level: "edit" }]);
    expect((await post()).status).toBe(403);
    expect(
      (await post({ ...BODY, knowledgeType: "verified_resource" })).status,
    ).toBe(200);
  });

  test("모르는 knowledgeType 은 400 VALIDATION_FAILED 다", async () => {
    setup([]);
    const r = await post({ ...BODY, knowledgeType: "other" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test.each([
    ["limit 0", { ...BODY, limit: 0 }],
    ["limit 51", { ...BODY, limit: 51 }],
    ["mode 가 모르는 값", { ...BODY, mode: "x" }],
    ["문자열이 아닌 grade", { ...BODY, grade: 2 }],
  ])("%s 이면 400 VALIDATION_FAILED 이다", async (_label, body) => {
    setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(kit.embedded).toEqual([]);
  });

  test("검색 rpc 오류는 500 INTERNAL_ERROR 다", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    setup();
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });

  test("GET 은 405 METHOD_NOT_ALLOWED 이고 Allow 는 POST 다", async () => {
    setup();
    const r = await callRoute(route, { method: "GET" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("POST");
  });

  test.each(["hybrid", "vector"])(
    "%s 모드의 행이 있는 응답도 계약 스키마를 통과한다",
    async (mode) => {
      rpcResult = {
        data: [
          {
            id: "k1",
            title: "제목",
            grade: "2",
            subject: "수학",
            career_field: "의사",
            similarity: 0.9,
            semantic_rank: 1,
            keyword_rank: null,
            rrf_score: 0.03,
          },
        ],
        error: null,
      };
      setup();
      const r = await post({ ...BODY, mode });
      expect(r.status).toBe(200);
      expect(searchPreviewResultSchema.safeParse(r.body).success).toBe(true);
      expect((r.body as { items: unknown[] }).items).toHaveLength(1);
    },
  );
});
