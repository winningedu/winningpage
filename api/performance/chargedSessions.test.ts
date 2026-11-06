// 스쿨멘토에는 performance_credit_ledger 행이 생기지 않는다. 센 세션의 정본은 tenant_usage_events 이고
// 수행평가 라우트가 "이미 센 세션"을 이 기록으로 판단하는지 session 라우트의 이어받기로 확인한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { callHandler } from "../_lib/fakeSupabase.testkit.js";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./session.js";

function makeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, v: unknown) => {
      rows = rows.filter((r) => r[col] === v);
      return q;
    };
    q.in = (col: string, v: unknown[]) => {
      rows = rows.filter((r) => v.includes(r[col]));
      return q;
    };
    q.order = () => q;
    q.limit = () => q;
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(ok, bad);
    return q;
  };
  const allowed = [
    {
      allowed: true,
      deny_reason: null,
      month_used: 1,
      month_limit: 3,
      month_remaining: 2,
      term_used: 1,
      term_limit: null,
      term_remaining: null,
      month_resets_on: "2026-12-01",
      term_resets_on: null,
    },
  ];
  return {
    from,
    rpc: async (name: string) => ({
      data: name === "fn_tenant_usage_state" ? allowed : null,
      error: null,
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
}

const session = {
  id: "s1",
  profile_id: "me",
  status: "in_progress",
  current_step: 3,
  completed_steps: [1, 2],
  updated_at: "2026-11-06T00:00:00Z",
};

const resume = () =>
  callHandler(
    handler as never,
    { action: "resume" },
    { authorization: "Bearer t" },
  );

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("스쿨멘토 센 세션 판정", () => {
  test("tenant_usage_events 에 센 세션은 미차감 세션으로 이어받지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    state.db = makeDb({
      performance_sessions: [session],
      tenant_usage_events: [
        {
          profile_id: "me",
          source_kind: "performance_session",
          source_id: "s1",
        },
      ],
    });
    const res = await resume();
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NO_UNCHARGED_SESSION" } });
  });

  test("센 기록이 없는 세션은 이어받는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    state.db = makeDb({ performance_sessions: [session] });
    const res = await resume();
    expect(res.status).toBe(201);
  });
});
