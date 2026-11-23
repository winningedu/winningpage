// GET, POST /api/selfeval/report. 세션 조회, 입력 읽기, 저장소, 모델은 모두 가짜로 바꾸고
// 소유자 한정, 완료 세션 조건, 멱등 재요청, 실패가 최종 저장을 건드리지 않는 응답 모양을 확인한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { StoredReport } from "../../_lib/selfeval/report/run.js";
import { sampleInput } from "../../_lib/selfeval/report/sample.testkit.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  session: null as unknown,
  loaded: null as unknown,
  row: null as unknown,
  claimOk: true,
  loadedForUser: [] as string[],
  model: null as unknown,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  }),
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: async (_db: unknown, userId: string, id: string) => {
    state.loadedForUser.push(userId);
    const s = state.session as { id: string; profile_id: string } | null;
    return s !== null && s.id === id && s.profile_id === userId ? s : null;
  },
}));
vi.mock("../../_lib/selfeval/report/load.js", () => ({
  loadReportInput: async () => state.loaded,
}));
vi.mock("../../_lib/selfeval/report/store.js", () => ({
  createReportStore: () => ({
    read: async () => state.row,
    claim: async () => state.claimOk,
    finish: async (_c: string, row: StoredReport) => {
      state.row = row;
      return true;
    },
  }),
}));
vi.mock("../../_lib/ai/gemini.js", () => ({
  callStructured: (...args: unknown[]) =>
    (state.model as (...a: unknown[]) => unknown)(...args),
}));

import handler from "./report.js";

type Res = { status: number; body: Record<string, unknown> };

async function call(
  method: "GET" | "POST",
  input: { body?: unknown; query?: Record<string, string> } = {},
): Promise<Res> {
  const out: Res = { status: 0, body: {} };
  const res = {
    setHeader: () => {},
    status(code: number) {
      out.status = code;
      return res;
    },
    json(p: Record<string, unknown>) {
      out.body = p;
      return res;
    },
  };
  const req = {
    method,
    body: input.body,
    query: input.query ?? {},
    headers: { authorization: "Bearer t" },
    socket: {},
  };
  await (handler as unknown as (a: unknown, b: unknown) => Promise<void>)(
    req,
    res,
  );
  return out;
}

const completedSession = (over: Record<string, unknown> = {}) => ({
  id: SESSION,
  profile_id: "me",
  status: "completed",
  ...over,
});

const modelEcho = () =>
  vi.fn(async (_s: string, user: string) => {
    const blocks = user
      .split(/\n\n(?=\[)/)
      .filter((b) => /^\[[^\]]+\]\n/.test(b));
    const items = blocks.map((b) => {
      const id = /^\[([^\]]+)\]/.exec(b)?.[1] as string;
      const tag = /꼬리표 ([PDAH]\d+)/.exec(b)?.[1];
      return { id, text: tag ? `정리함 ${tag}.` : "정리함." };
    });
    return { text: JSON.stringify({ items }), finishReason: "STOP" };
  });

beforeEach(() => {
  state.session = completedSession();
  const { tagMap: _t, ...input } = sampleInput();
  state.loaded = { input, finalRevision: 1 };
  state.row = null;
  state.claimOk = true;
  state.loadedForUser = [];
  state.model = modelEcho();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/selfeval/report", () => {
  test("builds the report after finalize and returns it with the fixed tag numbers", async () => {
    const res = await call("POST", { body: { sessionId: SESSION } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const report = res.body.report as {
      status: string;
      attempts: number;
      payload: { composeMissing: boolean; cover: { subjectTitle: string } };
    };
    expect(report).toMatchObject({ status: "ready", attempts: 1 });
    expect(report.payload.composeMissing).toBe(false);
    expect(report.payload.cover.subjectTitle).toBe("수학 자기평가서");
    expect((state.row as StoredReport).tagMap.P1).toBe("rec-p1");
  });

  test("returns the stored report for the same final revision without another model call", async () => {
    await call("POST", { body: { sessionId: SESSION } });
    const model = vi.fn();
    state.model = model;
    const res = await call("POST", { body: { sessionId: SESSION } });
    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(model).not.toHaveBeenCalled();
  });

  test("rejects a bad body, another student's session and a session that is not completed", async () => {
    expect((await call("POST", { body: { sessionId: "x" } })).status).toBe(400);
    state.session = completedSession({ profile_id: "someone-else" });
    const other = await call("POST", { body: { sessionId: SESSION } });
    expect(other.status).toBe(404);
    expect(other.body).toMatchObject({ error: { code: "SESSION_NOT_FOUND" } });
    state.session = completedSession({ status: "in_progress" });
    const open = await call("POST", { body: { sessionId: SESSION } });
    expect(open.status).toBe(409);
    expect(open.body).toMatchObject({
      error: { code: "SESSION_NOT_COMPLETED" },
    });
  });

  test("answers 409 FINAL_REPORT_MISSING without a final body and 409 REPORT_BUSY when another request holds it", async () => {
    state.loaded = null;
    const none = await call("POST", { body: { sessionId: SESSION } });
    expect(none.body).toMatchObject({
      error: { code: "FINAL_REPORT_MISSING" },
    });
    const { tagMap: _t, ...input } = sampleInput();
    state.loaded = { input, finalRevision: 1 };
    state.claimOk = false;
    const busy = await call("POST", { body: { sessionId: SESSION } });
    expect(busy.status).toBe(409);
    expect(busy.body).toMatchObject({ error: { code: "REPORT_BUSY" } });
  });

  test("still returns the code values when the model replies badly, and flags the missing text", async () => {
    state.model = vi.fn(async () => ({
      text: "not json",
      finishReason: "STOP",
    }));
    const res = await call("POST", { body: { sessionId: SESSION } });
    expect(res.status).toBe(200);
    const report = res.body.report as {
      payload: { composeMissing: boolean };
      attempts: number;
    };
    expect(report.payload.composeMissing).toBe(true);
    expect(report.attempts).toBe(2);
  });
});

describe("GET /api/selfeval/report", () => {
  test("returns the stored report to its owner", async () => {
    await call("POST", { body: { sessionId: SESSION } });
    const res = await call("GET", { query: { sessionId: SESSION } });
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({
      sessionId: SESSION,
      finalRevision: 1,
      status: "ready",
    });
    expect(state.loadedForUser.every((u) => u === "me")).toBe(true);
  });

  test("404 when the report was never built, 404 for another student and 400 for a bad query", async () => {
    const none = await call("GET", { query: { sessionId: SESSION } });
    expect(none.status).toBe(404);
    expect(none.body).toMatchObject({ error: { code: "REPORT_NOT_FOUND" } });
    state.session = completedSession({ profile_id: "someone-else" });
    expect((await call("GET", { query: { sessionId: SESSION } })).status).toBe(
      404,
    );
    expect((await call("GET", { query: {} })).status).toBe(400);
  });

  test("returns a failed report with no payload so the screen can offer a rebuild", async () => {
    state.row = {
      sessionId: SESSION,
      finalRevision: 1,
      payload: null,
      tagMap: {},
      status: "failed",
      attempts: 0,
      builtAt: "2026-11-23T00:00:00.000Z",
    } satisfies StoredReport;
    const res = await call("GET", { query: { sessionId: SESSION } });
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({ status: "failed", payload: null });
  });
});
