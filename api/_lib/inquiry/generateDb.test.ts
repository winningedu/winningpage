import { describe, expect, it, vi } from "vitest";
import {
  claimGeneration,
  consumeCredit,
  finishGeneration,
  loadAllTopics,
  markSessionInProgress,
  reverseCredit,
  saveDesign,
  saveTopicRound,
  terminateSession,
} from "./generateDb.js";

function rpcDb(result: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: result, error }));
  return { db: { rpc } as never, rpc };
}

describe("claimGeneration", () => {
  it("fn_inquiry_claim_generation 을 부르고 반환 jsonb 를 해석한다", async () => {
    const { db, rpc } = rpcDb({ kind: "claimed", attempts: 2 });
    const r = await claimGeneration(db, "s1", "u1", "design_report");
    expect(r).toEqual({ kind: "claimed", attempts: 2 });
    expect(rpc).toHaveBeenCalledWith("fn_inquiry_claim_generation", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_mode: "design_report",
    });
  });

  it("RPC 오류는 던진다", async () => {
    const { db } = rpcDb(null, { message: "boom" });
    await expect(
      claimGeneration(db, "s1", "u1", "design_report"),
    ).rejects.toThrow("fn_inquiry_claim_generation");
  });
});

describe("finishGeneration", () => {
  it("인자를 RPC 이름에 맞춰 넘기고 boolean 을 돌려준다", async () => {
    const { db, rpc } = rpcDb(true);
    const issues = [{ code: "x", message: "m" }];
    const r = await finishGeneration(
      db,
      "s1",
      "u1",
      "topic_recommendation",
      false,
      issues,
      1,
    );
    expect(r).toBe(true);
    expect(rpc).toHaveBeenCalledWith("fn_inquiry_finish_generation", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_mode: "topic_recommendation",
      p_ok: false,
      p_issues: issues,
      p_extra_attempts: 1,
    });
  });

  it("false 반환은 false 로 둔다", async () => {
    const { db } = rpcDb(false);
    expect(
      await finishGeneration(db, "s", "u", "design_report", true, [], 0),
    ).toBe(false);
  });
});

describe("terminateSession", () => {
  it("terminated 면 needsReverse 를 그대로 돌려준다", async () => {
    const { db, rpc } = rpcDb({
      ok: true,
      kind: "terminated",
      needsReverse: true,
      ledgerId: "l1",
    });
    expect(
      await terminateSession(db, "s", "u", "design_report", "fatal"),
    ).toEqual({ needsReverse: true });
    expect(rpc).toHaveBeenCalledWith("fn_inquiry_terminate_session", {
      p_session_id: "s",
      p_profile_id: "u",
      p_mode: "design_report",
      p_reason: "fatal",
    });
  });

  it("ok 가 아니면(locked, not_found) 되돌릴 것이 없다", async () => {
    const { db } = rpcDb({ ok: false, kind: "locked" });
    expect(await terminateSession(db, "s", "u", "design_report", "x")).toEqual({
      needsReverse: false,
    });
  });
});

describe("consumeCredit, reverseCredit", () => {
  it("차감 결과의 status 와 charged 를 읽는다", async () => {
    const { db, rpc } = rpcDb({ status: "charged", charged: true });
    expect(await consumeCredit(db, "s", "u")).toEqual({
      status: "charged",
      charged: true,
    });
    expect(rpc).toHaveBeenCalledWith("consume_inquiry_credit", {
      p_session_id: "s",
      p_profile_id: "u",
    });
  });

  it("거절 status 는 charged false 다", async () => {
    const { db } = rpcDb({ status: "quota_exhausted", charged: false });
    expect(await consumeCredit(db, "s", "u")).toEqual({
      status: "quota_exhausted",
      charged: false,
    });
  });

  it("되돌림 결과를 읽는다", async () => {
    const { db, rpc } = rpcDb({ status: "reversed", reversed: true });
    expect(await reverseCredit(db, "s", "u")).toEqual({
      status: "reversed",
      reversed: true,
    });
    expect(rpc).toHaveBeenCalledWith("reverse_inquiry_credit", {
      p_session_id: "s",
      p_profile_id: "u",
    });
  });
});

type Result = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/** from(table) 호출을 기록하고 "table.op" 별로 준비한 결과를 돌려주는 가짜 쿼리 빌더. */
function fakeDb(results: Record<string, Result> = {}) {
  const log: {
    table: string;
    op: string;
    payload?: unknown;
    filters: [string, unknown][];
  }[] = [];
  const from = (table: string) => {
    const entry: (typeof log)[number] = { table, op: "select", filters: [] };
    log.push(entry);
    const chain: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (
              res: (v: Result) => unknown,
              rej: (e: unknown) => unknown,
            ) =>
              Promise.resolve(
                results[`${table}.${entry.op}`] ?? { data: null, error: null },
              ).then(res, rej);
          }
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "update" || prop === "delete") {
              entry.op = prop;
              entry.payload = args[0];
            } else if (prop === "eq" || prop === "in") {
              entry.filters.push([String(args[0]), args[1]]);
            }
            return chain;
          };
        },
      },
    );
    return chain;
  };
  return { db: { from } as never, log };
}

const topicRow = {
  session_id: "s1",
  profile_id: "u1",
  round: 2,
  idx: 1,
  link_kind: "followup",
  linkage_type: "direct",
  fit: "match",
  detail: {},
} as never;

describe("saveTopicRound", () => {
  it("주제를 넣고 세션의 라운드 수와 단계를 갱신한다", async () => {
    const { db, log } = fakeDb({
      "inquiry_topics.insert": { data: [{ id: "t1" }], error: null },
    });
    const rows = await saveTopicRound(db, "u1", "s1", 2, [topicRow], "NOW");
    expect(rows).toEqual([{ id: "t1" }]);
    const upd = log.find((l) => l.table === "inquiry_sessions");
    expect(upd?.op).toBe("update");
    expect(upd?.payload).toEqual({
      topic_round_count: 2,
      current_step: 2,
      last_activity_at: "NOW",
    });
    expect(upd?.filters).toEqual([
      ["id", "s1"],
      ["profile_id", "u1"],
    ]);
  });

  it("세션 갱신이 실패하면 넣은 주제를 지우고 던진다", async () => {
    const { db, log } = fakeDb({
      "inquiry_topics.insert": { data: [{ id: "t1" }], error: null },
      "inquiry_sessions.update": { data: null, error: { message: "boom" } },
    });
    await expect(
      saveTopicRound(db, "u1", "s1", 2, [topicRow], "NOW"),
    ).rejects.toThrow("boom");
    const del = log.find((l) => l.op === "delete");
    expect(del?.table).toBe("inquiry_topics");
    expect(del?.filters).toEqual([
      ["session_id", "s1"],
      ["profile_id", "u1"],
      ["round", 2],
    ]);
  });

  it("주제 insert 가 실패하면 던진다", async () => {
    const { db } = fakeDb({
      "inquiry_topics.insert": { data: null, error: { message: "dup" } },
    });
    await expect(
      saveTopicRound(db, "u1", "s1", 2, [topicRow], "NOW"),
    ).rejects.toThrow("dup");
  });
});

describe("markSessionInProgress", () => {
  it("draft 세션만 in_progress 로 올린다", async () => {
    const { db, log } = fakeDb();
    await markSessionInProgress(db, "u1", "s1");
    expect(log[0]).toMatchObject({
      table: "inquiry_sessions",
      op: "update",
      payload: { status: "in_progress" },
    });
    expect(log[0]?.filters).toEqual([
      ["id", "s1"],
      ["profile_id", "u1"],
      ["status", "draft"],
    ]);
  });
});

describe("loadAllTopics", () => {
  it("세션의 모든 라운드 주제를 읽는다", async () => {
    const { db, log } = fakeDb({
      "inquiry_topics.select": { data: [{ id: "t1" }], error: null },
    });
    expect(await loadAllTopics(db, "u1", "s1")).toEqual([{ id: "t1" }]);
    expect(log[0]?.filters).toEqual([
      ["session_id", "s1"],
      ["profile_id", "u1"],
    ]);
  });
});

const designRow = {
  session_id: "s1",
  profile_id: "u1",
  report_type: "design",
  topic_id: "t1",
  sections: {},
  model: "m",
  prompt_version: "v",
} as never;

describe("saveDesign", () => {
  it("리포트를 넣고 주제 선택과 세션 포인터를 갱신한다", async () => {
    const { db, log } = fakeDb({
      "inquiry_reports.insert": { data: { id: "d1" }, error: null },
    });
    const row = await saveDesign(db, "u1", "s1", "t1", designRow, "NOW");
    expect(row).toEqual({ id: "d1" });
    const topic = log.find((l) => l.table === "inquiry_topics");
    expect(topic?.payload).toEqual({ selected: true });
    expect(topic?.filters).toEqual([
      ["id", "t1"],
      ["profile_id", "u1"],
    ]);
    const session = log.find((l) => l.table === "inquiry_sessions");
    expect(session?.payload).toEqual({
      selected_topic_id: "t1",
      design_report_id: "d1",
      current_step: 3,
      last_activity_at: "NOW",
    });
  });

  it("세션 갱신이 실패하면 리포트를 지우고 선택을 풀고 던진다", async () => {
    const { db, log } = fakeDb({
      "inquiry_reports.insert": { data: { id: "d1" }, error: null },
      "inquiry_sessions.update": { data: null, error: { message: "boom" } },
    });
    await expect(
      saveDesign(db, "u1", "s1", "t1", designRow, "NOW"),
    ).rejects.toThrow("boom");
    expect(
      log.some(
        (l) =>
          l.table === "inquiry_reports" &&
          l.op === "delete" &&
          l.filters.some(([k, v]) => k === "id" && v === "d1"),
      ),
    ).toBe(true);
    expect(
      log.some(
        (l) =>
          l.table === "inquiry_topics" &&
          l.op === "update" &&
          (l.payload as { selected?: boolean }).selected === false,
      ),
    ).toBe(true);
  });

  it("리포트 insert 가 실패하면 다른 것은 건드리지 않고 던진다", async () => {
    const { db, log } = fakeDb({
      "inquiry_reports.insert": { data: null, error: { message: "dup" } },
    });
    await expect(
      saveDesign(db, "u1", "s1", "t1", designRow, "NOW"),
    ).rejects.toThrow("dup");
    expect(log.every((l) => l.table === "inquiry_reports")).toBe(true);
  });
});
