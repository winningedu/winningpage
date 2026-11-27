// 응답을 보낸 뒤 텔레메트리 flush 가 scheduleAfterResponse 로 넘어가는지 확인한다.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const mocks = vi.hoisted(() => ({
  flush: vi.fn(async () => ({ ok: true, calls: 0, searches: 0 })),
  scheduleAfterResponse: vi.fn(),
  order: [] as string[],
  admin: null as unknown,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => mocks.admin,
}));
vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => null,
}));
vi.mock("../../_lib/afterResponse.js", () => ({
  scheduleAfterResponse: (work: () => Promise<unknown>) => {
    mocks.order.push("schedule");
    mocks.scheduleAfterResponse(work);
  },
}));
vi.mock("../../_lib/ai/telemetry/trace.js", () => ({
  createAiTrace: () => ({ flush: mocks.flush }),
}));
vi.mock("../../_lib/performance/embeddings.js", () => ({
  embedText: vi.fn(async () => [0.1, 0.2]),
}));

import { app } from "../app.js";

describe("admin/knowledge-eval 텔레메트리 flush", () => {
  beforeEach(() => {
    mocks.flush.mockClear();
    mocks.scheduleAfterResponse.mockClear();
    mocks.order.length = 0;
  });

  it("응답을 만든 뒤 flush 를 scheduleAfterResponse 에 넘기고 직접 기다리지 않는다", async () => {
    const db = createAdminFake({
      permissions: [{ resource_key: "knowledgeEvals", level: "edit" }],
      tables: {
        knowledge_golden_queries: () => ({
          data: [
            {
              id: "q1",
              knowledge_type: "topic_pattern",
              grade: "고2",
              subject: "물리학",
              career: null,
              selected_topic: null,
              assessment_info: null,
              expected_resource_ids: ["r1"],
            },
          ],
          error: null,
        }),
        knowledge_eval_runs: () => ({ data: { id: "run-1" }, error: null }),
      },
      rpcs: {
        match_winning_suhaeng_hybrid: () => ({
          data: [{ id: "r1" }],
          error: null,
        }),
      },
    });
    mocks.admin = db;
    const r = await callRoute(
      { app, path: "/api/admin/knowledge-eval" },
      {
        method: "POST",
        body: { action: "run", knowledgeType: "topic_pattern" },
      },
    );

    expect(r.status).toBe(200);
    expect(mocks.order).toEqual(["schedule"]);
    expect(mocks.flush).not.toHaveBeenCalled();
    const work = mocks.scheduleAfterResponse.mock
      .calls[0]?.[0] as () => Promise<unknown>;
    await work();
    expect(mocks.flush).toHaveBeenCalledWith(db);
  });
});
