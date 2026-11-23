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
    "or",
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

type Row = Record<string, unknown>;

// 행 하나를 실제로 들고 insert, update 조건을 적용하는 가짜. 동시 선점 경쟁을 재현한다.
function memoryDb(initial: Row | null = null) {
  const state = { row: initial };
  const cond = (term: string) => {
    const [col, op, ...rest] = term.split(".");
    const value = rest.join(".");
    return (r: Row) => {
      const v = r[col as string];
      if (op === "is") return v === null;
      if (op === "lt") return v !== null && String(v) < value;
      return String(v) === value;
    };
  };
  const from = () => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let insert: Row | null = null;
    let single = false;
    const b: Record<string, unknown> = {
      insert: (r: Row) => {
        insert = r;
        return b;
      },
      update: (p: Row) => {
        patch = p;
        return b;
      },
      select: () => b,
      maybeSingle: () => {
        single = true;
        return b;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => String(r[c]) === String(v));
        return b;
      },
      or: (expr: string) => {
        const terms = expr.split(",").map(cond);
        filters.push((r) => terms.some((t) => t(r)));
        return b;
      },
      // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
      then: (resolve: (v: unknown) => unknown) => {
        if (insert) {
          if (state.row) {
            return resolve({
              data: null,
              error: { code: "23505", message: "dup" },
            });
          }
          state.row = { claimed_at: null, ...insert };
          return resolve({ data: null, error: null });
        }
        if (single) {
          return resolve({ data: state.row, error: null });
        }
        const hit = state.row && filters.every((f) => f(state.row as Row));
        if (patch && hit) Object.assign(state.row as Row, patch);
        return resolve({
          data: hit ? [{ session_id: "s1" }] : [],
          error: null,
        });
      },
    };
    return b;
  };
  return { db: { from } as never, state };
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
        claimedAt: "2026-11-23T00:01:00.000Z",
      }),
    ).toBe(true);
    expect(won.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["session_id", "s1"],
      ["built_at", stored.builtAt],
    ]);
    expect(won.calls.find((c) => c.op === "update")?.args[0]).toEqual({
      claimed_at: "2026-11-23T00:01:00.000Z",
    });
    expect(won.calls.find((c) => c.op === "or")?.args[0]).toBe(
      "claimed_at.is.null,claimed_at.lt.2026-11-23T00:00:10.000Z",
    );
    const lost = fakeDb({ data: [] });
    expect(
      await createReportStore(lost.db, "s1").claim({
        finalRevision: 1,
        existing: stored,
        claimedAt: "2026-11-23T00:01:00.000Z",
      }),
    ).toBe(false);
  });

  it("replaces a report of an older final revision with a placeholder when claiming", async () => {
    const f = fakeDb({ data: [{ session_id: "s1" }] });
    await createReportStore(f.db, "s1").claim({
      finalRevision: 2,
      existing: stored,
      claimedAt: "2026-11-23T00:01:00.000Z",
    });
    expect(f.calls.find((c) => c.op === "update")?.args[0]).toMatchObject({
      final_revision: 2,
      payload: {},
      tag_map: {},
      status: "failed",
      attempts: 0,
      built_at: "2026-11-23T00:01:00.000Z",
    });
  });

  it("lets only one of two concurrent requests claim the same stored report", async () => {
    const row = {
      session_id: "s1",
      final_revision: 1,
      payload: {},
      tag_map: {},
      status: "failed",
      attempts: 0,
      built_at: stored.builtAt,
      claimed_at: null,
    };
    const { db } = memoryDb(row);
    const store = createReportStore(db, "s1");
    const claimFrom = async (claimedAt: string) =>
      store.claim({
        finalRevision: 1,
        existing: await store.read(),
        claimedAt,
      });
    const a = await claimFrom("2026-11-23T00:00:10.000Z");
    // 두 번째 요청은 첫 요청이 선점한 뒤의 행을 읽는다. 선점 시각이 신선하면 잡지 못한다.
    const b = await claimFrom("2026-11-23T00:00:12.000Z");
    expect([a, b]).toEqual([true, false]);
  });

  it("lets a request take over a claim older than the step budget", async () => {
    const { db } = memoryDb({
      session_id: "s1",
      final_revision: 1,
      payload: {},
      tag_map: {},
      status: "failed",
      attempts: 0,
      built_at: stored.builtAt,
      claimed_at: "2026-11-23T00:00:00.000Z",
    });
    const taken = await createReportStore(db, "s1").claim({
      finalRevision: 1,
      existing: stored,
      claimedAt: "2026-11-23T00:02:00.000Z",
    });
    expect(taken).toBe(true);
  });

  it("reads a fresh first-build claim as building, not failed", async () => {
    const fresh = new Date().toISOString();
    const { db } = memoryDb(null);
    const store = createReportStore(db, "s1");
    await store.claim({ finalRevision: 1, existing: null, claimedAt: fresh });
    // 자리표시 행은 status failed 로 저장되지만 선점이 신선하면 읽기는 building 이다.
    const readDb = fakeDb({
      data: {
        session_id: "s1",
        final_revision: 1,
        payload: {},
        tag_map: {},
        status: "failed",
        attempts: 0,
        built_at: fresh,
        claimed_at: fresh,
      },
    });
    expect((await createReportStore(readDb.db, "s1").read())?.status).toBe(
      "building",
    );
  });

  it("writes the result only for the claimant", async () => {
    const f = fakeDb({ data: [{ session_id: "s1" }] });
    expect(await createReportStore(f.db, "s1").finish("t1", stored)).toBe(true);
    expect(f.calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["session_id", "s1"],
      ["claimed_at", "t1"],
    ]);
    expect(
      await createReportStore(fakeDb({ data: [] }).db, "s1").finish(
        "t1",
        stored,
      ),
    ).toBe(false);
  });
});
