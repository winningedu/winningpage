// 응답을 보낸 뒤 텔레메트리 flush 가 waitUntil 로 넘어가는지 확인한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminFake } from "../../_lib/adminRoute.testkit.js";

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

import handler from "./knowledge-search.js";

describe("admin/knowledge-search 텔레메트리 flush", () => {
  beforeEach(() => {
    mocks.flush.mockClear();
    mocks.scheduleAfterResponse.mockClear();
    mocks.order.length = 0;
  });

  it("응답 json 을 보낸 뒤 flush 를 scheduleAfterResponse 에 넘기고 직접 기다리지 않는다", async () => {
    const db = createAdminFake({
      permissions: [{ resource_key: "winningSuhaengTopicDb", level: "view" }],
      rpcs: {
        match_winning_suhaeng_hybrid: () => ({ data: [], error: null }),
      },
    });
    mocks.admin = db;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(() => {
        mocks.order.push("json");
      }),
      end: vi.fn(),
    };
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer admin-token" },
        query: {},
        body: {
          knowledgeType: "topic_pattern",
          grade: "2",
          subject: "수학",
          career: "의사",
        },
      } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );

    expect(mocks.order).toEqual(["json", "schedule"]);
    expect(mocks.flush).not.toHaveBeenCalled();
    const work = mocks.scheduleAfterResponse.mock
      .calls[0]?.[0] as () => Promise<unknown>;
    await work();
    expect(mocks.flush).toHaveBeenCalledWith(db);
  });
});
