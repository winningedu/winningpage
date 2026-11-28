// GET, POST /api/admin/knowledge-eval 계약 검증. 이력 조회는 view, 평가 실행과 조합 비교는 edit.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

import {
  runResponse,
  runsResponse,
  sweepResponse,
} from "../../../shared/knowledge-eval/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/knowledge-eval" };

const GOLDEN = {
  id: "q1",
  knowledge_type: "topic_pattern",
  grade: "고2",
  subject: "물리학",
  career: null,
  selected_topic: null,
  assessment_info: null,
  expected_resource_ids: ["r1", "r2"],
};
const RUN_ROW = { id: "run-1", knowledge_type: "topic_pattern" };

let golden: Respond;
let runs: Respond;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "knowledgeEvals", level }] : [],
    tables: {
      knowledge_golden_queries: (query) => golden(query),
      knowledge_eval_runs: (query) => runs(query),
    },
    rpcs: {
      match_winning_suhaeng_hybrid: () => ({
        data: [{ id: "r1" }],
        error: null,
      }),
      match_winning_suhaeng_all_subjects: () => ({
        data: [{ id: "r1" }],
        error: null,
      }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const get = (query: Record<string, string> = { view: "runs" }) =>
  callRoute(handler, { query });
const post = (body: unknown) => callRoute(handler, { method: "POST", body });
const RUN = { action: "run", knowledgeType: "topic_pattern" };
const SWEEP = {
  action: "sweep",
  knowledgeType: "topic_pattern",
  grid: { rrfK: [20] },
};

beforeEach(() => {
  kit.embedded.length = 0;
  golden = () => ({ data: [GOLDEN], error: null });
  runs = (query) =>
    argsOf(query, "insert")
      ? Array.isArray(argsOf(query, "insert")?.[0])
        ? { data: [{ id: "run-1" }], error: null }
        : { data: { id: "run-1" }, error: null }
      : { data: [RUN_ROW], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/knowledge-eval", () => {
  test("view 권한이면 ok 없이 productionParams 와 items 를 돌려준다", async () => {
    const admin = setup("view");
    const r = await get({ view: "runs", knowledgeType: "topic_pattern" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      productionParams: {
        topic_pattern: expect.objectContaining({ rrfK: 60 }),
        verified_resource: expect.objectContaining({ rrfK: 60 }),
      },
      items: [RUN_ROW],
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(r.headers["cache-control"]).toBe("no-store");
    const query = firstQuery(admin, "knowledge_eval_runs");
    expect(argsOf(query, "eq")).toEqual(["knowledge_type", "topic_pattern"]);
    expect(argsOf(query, "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
    expect(argsOf(query, "limit")).toEqual([50]);
  });

  test("이력 행은 계약 runsResponse 로 읽힌다", async () => {
    const params = {
      matchThreshold: 0.3,
      rrfK: 60,
      fullTextWeight: 1,
      semanticWeight: 1,
      matchCount: 10,
    };
    runs = () => ({
      data: [
        {
          id: "run-1",
          created_at: "2026-11-26T00:00:00.000Z",
          created_by: "admin-1",
          knowledge_type: "topic_pattern",
          mode: "hybrid",
          params,
          query_count: 1,
          metrics: { recall: { "1": 1 }, mrr: 1 },
          per_query: [
            {
              queryId: "q1",
              label: "고2 물리학",
              expectedIds: ["r1"],
              ranks: [1],
            },
          ],
          note: null,
        },
      ],
      error: null,
    });
    setup("view");
    const r = await get();
    expect(r.status).toBe(200);
    expect(runsResponse.parse(r.body)).toEqual(r.body);
  });

  test("PUT 은 405 이고 Allow 는 GET, HEAD, POST 다", async () => {
    setup("edit");
    const r = await callRoute(handler, { method: "PUT", body: RUN });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD, POST");
  });

  test("모르는 knowledgeType 이나 view 는 400 VALIDATION_FAILED 다", async () => {
    setup("view");
    const bad = await get({ view: "runs", knowledgeType: "other" });
    expect(bad.status).toBe(400);
    expect(problemCode(bad.body)).toBe("VALIDATION_FAILED");
    expect((await get({})).status).toBe(400);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    runs = () => ({ data: null, error: { message: "boom" } });
    setup("view");
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/admin/knowledge-eval", () => {
  test("view 권한으로는 403 FORBIDDEN 이고 임베딩도 저장도 하지 않는다", async () => {
    const admin = setup("view");
    for (const body of [RUN, SWEEP]) {
      const r = await post(body);
      expect(r.status).toBe(403);
      expect(problemCode(r.body)).toBe("FORBIDDEN");
    }
    expect(kit.embedded).toEqual([]);
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "knowledge_eval_runs",
    );
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    expect((await post(RUN)).status).toBe(403);
  });

  test("edit 권한의 run 은 ok 없이 runId, queryCount, params, metrics, perQuery 를 돌려주고 이력 1행을 저장한다", async () => {
    const admin = setup("edit");
    const r = await post({ ...RUN, params: { rrfK: 20 }, note: " 메모 " });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      runId: "run-1",
      queryCount: 1,
      params: expect.objectContaining({ rrfK: 20 }),
      metrics: expect.objectContaining({ mrr: 1 }),
      perQuery: [expect.objectContaining({ queryId: "q1", ranks: [1, null] })],
    });
    expect(runResponse.parse(r.body)).toEqual(r.body);
    expect(r.body).not.toHaveProperty("ok");
    const insert = argsOf(firstQuery(admin, "knowledge_eval_runs"), "insert");
    expect(insert?.[0]).toMatchObject({
      created_by: "admin-1",
      knowledge_type: "topic_pattern",
      mode: "hybrid",
      note: "메모",
    });
  });

  test("edit 권한의 sweep 은 ok 없이 queryCount, productionParams, items 를 돌려준다", async () => {
    setup("edit");
    const r = await post(SWEEP);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      queryCount: 1,
      productionParams: expect.objectContaining({ rrfK: 60 }),
      items: [
        expect.objectContaining({
          status: "done",
          runId: "run-1",
          params: expect.objectContaining({ rrfK: 20 }),
        }),
      ],
    });
    expect(sweepResponse.parse(r.body)).toEqual(r.body);
    expect(r.body).not.toHaveProperty("ok");
  });

  test("활성 질의가 없으면 run 과 sweep 모두 422 NO_QUERIES 이고 저장하지 않는다", async () => {
    golden = () => ({ data: [], error: null });
    const admin = setup("edit");
    for (const body of [RUN, SWEEP]) {
      const r = await post(body);
      expect(r.status).toBe(422);
      expect(problemCode(r.body)).toBe("NO_QUERIES");
      expect((r.body as { detail: string }).detail).toBe(
        "활성 질의가 없습니다. 기준 문제집에 질의를 먼저 추가하세요.",
      );
    }
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "knowledge_eval_runs",
    );
  });

  test.each([
    [
      "action 이 모르는 값",
      { ...RUN, action: "x" },
      "action 은 run 또는 sweep 입니다.",
    ],
    [
      "knowledgeType 이 모르는 값",
      { ...RUN, knowledgeType: "other" },
      "knowledgeType 이 올바르지 않습니다.",
    ],
    [
      "범위를 벗어난 params",
      { ...RUN, params: { matchThreshold: 2 } },
      "matchThreshold 는 0부터 1 사이 숫자여야 합니다.",
    ],
    [
      "mode 가 모르는 값",
      { ...RUN, mode: "x" },
      "mode 는 vector 또는 hybrid 입니다.",
    ],
    ["본문이 null", null, "요청 바디가 올바르지 않습니다."],
    [
      "조합이 24개를 넘는 sweep",
      {
        ...SWEEP,
        grid: {
          rrfK: [10, 20, 30, 40, 50],
          weights: [],
          matchThreshold: [0.4, 0.5, 0.6, 0.7, 0.8],
        },
      },
      "조합은 24개까지입니다. 지금 25개입니다.",
    ],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 사유가 errors[0].message 에 실리며 임베딩하지 않는다",
    async (_label, body, reason) => {
      setup("edit");
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(r.body).toMatchObject({ errors: [{ message: reason }] });
      expect(kit.embedded).toEqual([]);
    },
  );

  test("DB 오류는 500 INTERNAL_ERROR 다", async () => {
    golden = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    const r = await post(RUN);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
