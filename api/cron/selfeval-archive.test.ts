// GET /api/cron/selfeval-archive: 만료는 세션 주인의 시간대 달력 날짜로 90일을 센다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  stale: [] as { id: string; profile_id: string; last_activity_at: string }[],
  zones: [] as { id: string; time_zone: string }[],
  terminated: [] as string[],
  staleFilter: [] as unknown[][],
}));

function chain(result: () => unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result());
        }
        return (...args: unknown[]) => {
          if (prop === "lt") state.staleFilter.push(args);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === "profiles") {
          return chain(() => ({ data: state.zones, error: null }));
        }
        if (cols.includes("last_activity_at")) {
          return chain(() => ({ data: state.stale, error: null }));
        }
        return chain(() => ({ data: [], error: null }));
      },
    }),
  }),
}));
vi.mock("../_lib/selfeval/db.js", () => ({
  terminateSession: async (_db: unknown, _p: string, id: string) => {
    state.terminated.push(id);
    return { ok: true };
  },
  reverseCredit: async () => undefined,
}));

import handler from "./selfeval-archive.js";

async function get(): Promise<{ status: number; body: unknown }> {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => {},
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer cron-secret" },
    } as unknown as VercelRequest,
    res,
  );
  return out;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  state.stale = [];
  state.zones = [];
  state.terminated = [];
  state.staleFilter = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/selfeval-archive", () => {
  test("세션 주인의 시간대 달력 날짜로 90일이 지난 세션만 보관한다", async () => {
    // 지금은 서울 10-31, UTC 10-30. 시작은 둘 다 UTC 08-01 15:30(서울 08-02).
    state.stale = [
      {
        id: "seoul",
        profile_id: "p1",
        last_activity_at: "2026-08-01T15:30:00Z",
      },
      { id: "la", profile_id: "p2", last_activity_at: "2026-08-01T15:30:00Z" },
    ];
    state.zones = [
      { id: "p1", time_zone: "Asia/Seoul" },
      { id: "p2", time_zone: "America/Los_Angeles" },
    ];

    const r = await get();

    expect(r.status).toBe(200);
    // 서울: 08-02 에서 10-31 은 90일. LA: 08-01 에서 10-30 은 90일.
    expect(state.terminated.sort()).toEqual(["la", "seoul"]);
  });

  test("달력 날짜로 90일이 안 된 세션은 보관하지 않는다", async () => {
    vi.setSystemTime(new Date("2026-10-30T14:59:59Z"));
    state.stale = [
      {
        id: "seoul",
        profile_id: "p1",
        last_activity_at: "2026-08-01T15:30:00Z",
      },
    ];
    state.zones = [{ id: "p1", time_zone: "Asia/Seoul" }];

    await get();

    expect(state.terminated).toEqual([]);
  });
});
