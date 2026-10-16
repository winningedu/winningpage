// 평가, 확정, 만료 보관의 DB 호출 모양 테스트. 호출 인자와 반환 변환만 본다.
import { describe, expect, it } from "vitest";
import {
  archiveExpiredSessions,
  callFinalizeRpc,
  finalizeDraftSubmission,
  setReplyPending,
} from "./evaluateDb.js";

type Call = { op: string; args: unknown[] };

function recorder(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of [
    "from",
    "update",
    "select",
    "eq",
    "in",
    "lt",
    "order",
    "limit",
  ]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return Object.assign(Promise.resolve(result), chain);
    };
  }
  chain.maybeSingle = async () => result;
  chain.single = async () => result;
  const db = {
    ...chain,
    rpc: async (...args: unknown[]) => {
      calls.push({ op: "rpc", args });
      return result;
    },
  };
  return { db: db as never, calls };
}

describe("archiveExpiredSessions", () => {
  it("열린 세션 중 마지막 활동이 기준 이전인 것을 보관하고 id 를 돌려준다", async () => {
    const { db, calls } = recorder({
      data: [{ id: "a" }, { id: "b" }],
      error: null,
    });
    const ids = await archiveExpiredSessions(db, "2026-07-01T00:00:00.000Z");
    expect(ids).toEqual(["a", "b"]);
    expect(calls.find((c) => c.op === "from")?.args).toEqual([
      "inquiry_sessions",
    ]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual([
      "status",
      ["draft", "in_progress"],
    ]);
    expect(calls.find((c) => c.op === "lt")?.args).toEqual([
      "last_activity_at",
      "2026-07-01T00:00:00.000Z",
    ]);
    const patch = calls.find((c) => c.op === "update")?.args[0] as {
      status: string;
    };
    expect(patch.status).toBe("archived");
  });

  it("DB 오류는 던진다", async () => {
    const { db } = recorder({ data: null, error: { message: "boom" } });
    await expect(archiveExpiredSessions(db, "x")).rejects.toThrow("boom");
  });
});

describe("callFinalizeRpc", () => {
  it("fn_inquiry_finalize 를 부르고 반환 jsonb 를 그대로 돌려준다", async () => {
    const { db, calls } = recorder({
      data: { status: "completed", activityRecordId: "a" },
      error: null,
    });
    const fields = {
      topic: "t",
      concept: "c",
      method: "m",
      result: "r",
      limitation: "l",
      numbers: [],
      sources: [],
    };
    const raw = await callFinalizeRpc(db, "s1", "u1", fields);
    expect(raw).toEqual({ status: "completed", activityRecordId: "a" });
    expect(calls.find((c) => c.op === "rpc")?.args).toEqual([
      "fn_inquiry_finalize",
      { p_session_id: "s1", p_profile_id: "u1", p_fields: fields },
    ]);
  });
});

describe("setReplyPending", () => {
  it("본인 세션의 reply_pending 을 갱신한다", async () => {
    const { db, calls } = recorder({ data: null, error: null });
    await setReplyPending(db, "u1", "s1", true);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({
      reply_pending: true,
    });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["id", "s1"],
      ["profile_id", "u1"],
    ]);
  });
});

describe("finalizeDraftSubmission", () => {
  it("초안을 확정본으로 바꾸고 제출 시각을 남긴다", async () => {
    const { db, calls } = recorder({
      data: {
        id: "sub",
        revision: 1,
        sections: {},
        char_counts: {},
        is_draft: false,
        updated_at: "t",
      },
      error: null,
    });
    const row = await finalizeDraftSubmission(
      db,
      "u1",
      "sub",
      "2026-10-06T00:00:00Z",
    );
    expect(row.is_draft).toBe(false);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({
      is_draft: false,
      submitted_at: "2026-10-06T00:00:00Z",
    });
  });
});
