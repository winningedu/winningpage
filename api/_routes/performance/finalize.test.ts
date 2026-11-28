import { describe, expect, test, vi } from "vitest";
import { finalizeResponse } from "../../../shared/performance/finalize.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  authOnlyDb,
  rowsDb,
  SESSION_ID,
  validationFailedFor,
} from "../../_lib/performance/route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const route = { app, path: "/api/performance/finalize" };
const GOOD = { sessionId: SESSION_ID, submissionId: SESSION_ID };

describe("finalize 요청 형식", () => {
  test.each([
    ["sessionId 없음", { ...GOOD, sessionId: undefined }, "sessionId"],
    ["sessionId 가 uuid 아님", { ...GOOD, sessionId: "x" }, "sessionId"],
    [
      "submissionId 가 uuid 아님",
      { ...GOOD, submissionId: "x" },
      "submissionId",
    ],
    ["action 을 모름", { ...GOOD, action: "zzz" }, "action"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("finalize 도메인 규칙과 응답", () => {
  test("평가 리포트가 없으면 400 NO_EVALUATION_YET 이고 charged 는 false 다", async () => {
    state.db = {
      ...rowsDb({
        performance_sessions: [{ id: SESSION_ID, profile_id: "me" }],
        performance_submissions: [{ id: SESSION_ID, revision: 1, fields: {} }],
      }),
      rpc: async (name: string) => ({
        data:
          name === "finalize_performance_submission"
            ? { status: "no_evaluation" }
            : [
                {
                  allowed: true,
                  program_key: "suhaeng",
                  reason: null,
                  expires_at: null,
                },
              ],
        error: null,
      }),
    };
    const res = await callRoute(route, { method: "POST", body: GOOD });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "NO_EVALUATION_YET",
      charged: false,
    });
  });

  test("확정 성공 응답이 스키마를 통과한다", async () => {
    state.db = {
      ...rowsDb({
        performance_sessions: [{ id: SESSION_ID, profile_id: "me" }],
        performance_submissions: [{ id: SESSION_ID, revision: 2, fields: {} }],
      }),
      rpc: async (name: string) => ({
        data:
          name === "finalize_performance_submission"
            ? {
                status: "finalized",
                revision: 2,
                finalized_at: "2026-11-27T00:00:00Z",
                finalize_reason: "confirm",
                report_id: "r1",
              }
            : [
                {
                  allowed: true,
                  program_key: "suhaeng",
                  reason: null,
                  expires_at: null,
                },
              ],
        error: null,
      }),
    };
    const res = await callRoute(route, { method: "POST", body: GOOD });
    expect(res.status).toBe(200);
    expect(finalizeResponse.parse(res.body)).toMatchObject({
      finalReportId: "r1",
      reused: false,
      charged: false,
    });
  });
});
