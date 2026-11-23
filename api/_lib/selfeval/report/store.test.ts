import { describe, expect, it } from "vitest";
import type { StoredReport } from "./run.js";
import { createReportStore } from "./store.js";

type Call = { op: string; args: unknown[] };

// 호출된 쿼리를 기록하고 미리 정한 결과를 돌려주는 가짜 빌더.
function fakeDb(result: { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of [
    "select",
    "insert",
    "update",
    "eq",
    "maybeSingle",
    "from",
  ]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: result.data ?? null, error: result.error ?? null });
  return { db: chain as never, calls };
}

const stored: StoredReport = {
  sessionId: "s1",
  finalRevision: 1,
  payload: null,
  tagMap: {},
  status: "failed",
  attempts: 0,
  builtAt: "2026-11-23T00:00:00.000Z",
};

describe("createReportStore", () => {
  it("claims a new report by inserting a placeholder and treats a unique violation as busy", async () => {
    const ok = fakeDb({});
    expect(
      await createReportStore(ok.db, "s1").claim({
        finalRevision: 1,
        existing: null,
        claimedAt: "t1",
      }),
    ).toBe(true);
    expect(ok.calls.find((c) => c.op === "insert")?.args[0]).toMatchObject({
      session_id: "s1",
      final_revision: 1,
      status: "failed",
      attempts: 0,
      built_at: "t1",
    });
    const dup = fakeDb({ error: { code: "23505", message: "dup" } });
    expect(
      await createReportStore(dup.db, "s1").claim({
        finalRevision: 1,
        existing: null,
        claimedAt: "t1",
      }),
    ).toBe(false);
  });

  it("claims an existing report only while built_at is unchanged", async () => {
    const won = fakeDb({ data: [{ session_id: "s1" }] });
    expect(
      await createReportStore(won.db, "s1").claim({
        finalRevision: 1,
        existing: stored,
        claimedAt: "t2",
      }),
    ).toBe(true);
    expect(won.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["session_id", "s1"],
      ["built_at", stored.builtAt],
    ]);
    expect(won.calls.find((c) => c.op === "update")?.args[0]).toEqual({
      built_at: "t2",
    });
    const lost = fakeDb({ data: [] });
    expect(
      await createReportStore(lost.db, "s1").claim({
        finalRevision: 1,
        existing: stored,
        claimedAt: "t2",
      }),
    ).toBe(false);
  });

  it("replaces a report of an older final revision with a placeholder when claiming", async () => {
    const f = fakeDb({ data: [{ session_id: "s1" }] });
    await createReportStore(f.db, "s1").claim({
      finalRevision: 2,
      existing: stored,
      claimedAt: "t2",
    });
    expect(f.calls.find((c) => c.op === "update")?.args[0]).toMatchObject({
      final_revision: 2,
      payload: {},
      tag_map: {},
      status: "failed",
      attempts: 0,
      built_at: "t2",
    });
  });

  it("writes the result only for the claimant", async () => {
    const f = fakeDb({ data: [{ session_id: "s1" }] });
    expect(await createReportStore(f.db, "s1").finish("t1", stored)).toBe(true);
    expect(f.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["session_id", "s1"],
      ["built_at", "t1"],
    ]);
    expect(
      await createReportStore(fakeDb({ data: [] }).db, "s1").finish(
        "t1",
        stored,
      ),
    ).toBe(false);
  });
});
