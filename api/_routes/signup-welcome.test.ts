// POST /api/signup-welcome 의 사이트 게이트(스쿨멘토에는 쿠폰이 없다).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown, sendCalls: 0 }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

vi.mock("../_lib/messaging/alimtalkSend.js", () => ({
  sendAndLog: async () => {
    state.sendCalls += 1;
    return { status: "sent" };
  },
}));

import handler from "./signup-welcome.js";

let db: FakeDb;

beforeEach(() => {
  state.sendCalls = 0;
  db = createFakeDb({
    rpcs: { fn_grant_signup_coupons_for_user: () => 2 },
  });
  state.db = createFakeSupabase(db);
});

describe("signup-welcome 사이트 게이트", () => {
  test("스쿨멘토에서는 토큰 없이도 200 skipped 이고 쿠폰 발급과 알림톡을 부르지 않는다", async () => {
    process.env.SITE = "schoolmentor";
    const res = await callHandler(handler as never, undefined);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      skipped: true,
      reason: "schoolmentor",
    });
    expect(db.rpcCalls).toEqual([]);
    expect(state.sendCalls).toBe(0);
  });

  test("위닝에서는 토큰이 없으면 기존대로 401 이다", async () => {
    process.env.SITE = "winning";
    const res = await callHandler(handler as never, undefined);
    expect(res.status).toBe(401);
  });
});
