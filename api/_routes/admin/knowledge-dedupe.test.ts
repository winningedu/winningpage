// POST /api/admin/knowledge-dedupe 계약 검증. 권한, 본문 검증, 응답 모양.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { knowledgeDedupeResultSchema } from "../../../shared/knowledge/contract.js";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  flush: vi.fn(async () => ({ ok: true })),
  scheduled: [] as (() => Promise<unknown>)[],
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
  scheduleAfterResponse: (work: () => Promise<unknown>) => {
    kit.scheduled.push(work);
  },
}));
vi.mock("../../_lib/ai/telemetry/trace.js", () => ({
  createAiTrace: () => ({ flush: kit.flush }),
}));
vi.mock("../../_lib/performance/embeddings.js", () => ({
  buildKnowledgeSearchText: (item: { title: string }) => `검색:${item.title}`,
  embedText: vi.fn(async (text: string) => {
    kit.embedded.push(text);
    return [0.1, 0.2];
  }),
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/knowledge-dedupe" };

const ITEM = {
  rowNo: 2,
  title: "마찰력 실험",
  content: "내용",
  grade: "2",
  subject: "물리",
  career_field: "",
  source: "",
  source_link: "",
  keywords: "",
  memo: "",
};
const BODY = { knowledgeType: "topic_pattern", items: [ITEM] };

let knowledge: Respond = () => ({ data: [], error: null });
let near = [] as unknown[];

function setup(
  permissions: { resource_key: string; level: string }[] = [
    { resource_key: "winningSuhaengTopicDb", level: "edit" },
  ],
) {
  kit.admin = createAdminFake({
    permissions,
    tables: { winning_assessment_knowledge_items: (q) => knowledge(q) },
    rpcs: { fn_knowledge_near_duplicates: () => ({ data: near, error: null }) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const post = (body: unknown = BODY) =>
  callRoute(route, { method: "POST", body });

beforeEach(() => {
  knowledge = () => ({ data: [], error: null });
  near = [];
  kit.scheduled.length = 0;
  kit.embedded.length = 0;
  kit.flush.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/knowledge-dedupe", () => {
  test("edit 권한이면 { items } 로 돌려주고 ok 필드는 없다", async () => {
    knowledge = () => ({
      data: [{ id: "k1", title: "마찰력 실험", content: "내용" }],
      error: null,
    });
    near = [{ id: "k2", title: "비슷", similarity: 0.97 }];
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          rowNo: 2,
          exact: [{ id: "k1", title: "마찰력 실험" }],
          near: [{ id: "k2", title: "비슷", similarity: 0.97 }],
        },
      ],
    });
    expect(
      argsOf(firstQuery(admin, "winning_assessment_knowledge_items"), "eq"),
    ).toEqual(["knowledge_type", "topic_pattern"]);
    expect(admin.rpcCalls[0]?.args).toMatchObject({
      filter_knowledge_type: "topic_pattern",
    });
    expect(kit.embedded).toEqual(["검색:마찰력 실험"]);
    expect(knowledgeDedupeResultSchema.safeParse(r.body).success).toBe(true);
  });

  test("응답 뒤에 trace flush 를 scheduleAfterResponse 로 넘긴다", async () => {
    setup();
    await post();
    expect(kit.scheduled).toHaveLength(1);
    expect(kit.flush).not.toHaveBeenCalled();
  });

  test("view 권한만 있으면 403 이고 임베딩을 쓰지 않는다", async () => {
    setup([{ resource_key: "winningSuhaengTopicDb", level: "view" }]);
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(kit.embedded).toEqual([]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup([]);
    expect(problemCode((await post()).body)).toBe("FORBIDDEN");
  });

  test("다른 타입 메뉴의 권한만 있으면 403 이다", async () => {
    setup([{ resource_key: "winningSuhaengResourceDb", level: "edit" }]);
    expect((await post()).status).toBe(403);
    const ok = await post({ ...BODY, knowledgeType: "verified_resource" });
    expect(ok.status).toBe(200);
  });

  test("모르는 knowledgeType 은 403 이 아니라 400 VALIDATION_FAILED 다", async () => {
    setup([]);
    const r = await post({ ...BODY, knowledgeType: "other" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test.each([
    ["items 가 비어 있음", { ...BODY, items: [] }],
    ["items 가 201건", { ...BODY, items: Array(201).fill(ITEM) }],
    ["rowNo 가 정수가 아님", { ...BODY, items: [{ ...ITEM, rowNo: "x" }] }],
  ])("%s 이면 400 VALIDATION_FAILED 이다", async (_label, body) => {
    setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(kit.embedded).toEqual([]);
  });

  test("기존 행 조회 오류는 500 INTERNAL_ERROR 이다", async () => {
    knowledge = () => ({ data: null, error: { message: "boom" } });
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
});
