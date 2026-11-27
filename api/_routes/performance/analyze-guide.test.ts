import { describe, expect, test, vi } from "vitest";
import { analyzeGuideResponse } from "../../../shared/performance/analyze-guide.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { GUIDE_FREETEXT_MAX_LENGTH } from "../../_lib/performance/guide-freetext.js";
import {
  authOnlyDb,
  paidDb,
  rowsDb,
  SESSION_ID,
  validationFailedFor,
} from "./route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const route = { app, path: "/api/performance/analyze-guide" };

describe("analyze-guide 요청 형식", () => {
  test.each([
    ["sessionId 없음", { freetext: "a" }, "sessionId"],
    ["sessionId 가 uuid 아님", { sessionId: "x", freetext: "a" }, "sessionId"],
    [
      "attachmentIds 가 비어 있음",
      { sessionId: SESSION_ID, attachmentIds: [] },
      "attachmentIds",
    ],
    [
      "attachmentIds 가 uuid 아님",
      { sessionId: SESSION_ID, attachmentIds: ["x"] },
      "attachmentIds",
    ],
    [
      "attachmentIds 가 6개",
      { sessionId: SESSION_ID, attachmentIds: Array(6).fill(SESSION_ID) },
      "attachmentIds",
    ],
    [
      "attachmentIds 와 freetext 가 모두 없음",
      { sessionId: SESSION_ID },
      "attachmentIds",
    ],
    [
      "force 가 불리언 아님",
      { sessionId: SESSION_ID, freetext: "a", force: "yes" },
      "force",
    ],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("analyze-guide 도메인 규칙과 응답", () => {
  test("첨부와 직접 입력을 함께 보내면 400 AMBIGUOUS_INPUT 을 그대로 낸다", async () => {
    state.db = paidDb();
    const res = await callRoute(route, {
      method: "POST",
      body: {
        sessionId: SESSION_ID,
        attachmentIds: [SESSION_ID],
        freetext: "a",
      },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "AMBIGUOUS_INPUT",
      detail: "attachmentIds와 freetext는 함께 보낼 수 없습니다.",
    });
  });

  test("직접 입력이 상한을 넘으면 400 FREETEXT_TOO_LONG 을 그대로 낸다", async () => {
    state.db = paidDb();
    const res = await callRoute(route, {
      method: "POST",
      body: {
        sessionId: SESSION_ID,
        freetext: "가".repeat(GUIDE_FREETEXT_MAX_LENGTH + 1),
      },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "FREETEXT_TOO_LONG",
      maxLength: GUIDE_FREETEXT_MAX_LENGTH,
    });
  });

  test("직접 입력 응답이 스키마를 통과한다", async () => {
    state.db = rowsDb({
      performance_sessions: [
        {
          id: SESSION_ID,
          status: "draft",
          current_step: 1,
          completed_steps: [],
          guide_json: null,
          guide_analysis_count: 0,
        },
      ],
    });
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: SESSION_ID, freetext: "안내문 내용" },
    });
    expect(res.status).toBe(200);
    expect(analyzeGuideResponse.parse(res.body).guide).toMatchObject({
      mode: "manual",
      text: "안내문 내용",
    });
  });
});
