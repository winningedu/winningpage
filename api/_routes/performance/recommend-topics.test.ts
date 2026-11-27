import { describe, expect, test, vi } from "vitest";
import { recommendTopicsResponse } from "../../../shared/performance/recommend-topics.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";
import {
  authOnlyDb,
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

const route = { app, path: "/api/performance/recommend-topics" };

// 기본 정보와 직접 입력 안내문이 채워진 세션. 선행 조건 게이트를 통과한다.
const sessionRow = {
  id: SESSION_ID,
  profile_id: "me",
  grade_label: "고1",
  semester: "1학기",
  subject_group: "과학",
  subject: "물리",
  career_goal: "연구원",
  guide_input_mode: "manual",
  guide_freetext: "안내문 내용",
  guide_json: null,
};

describe("recommend-topics 요청 형식", () => {
  test.each([
    ["sessionId 없음", {}, "sessionId"],
    ["sessionId 가 uuid 아님", { sessionId: "x" }, "sessionId"],
    ["round 가 0", { sessionId: SESSION_ID, round: 0 }, "round"],
    ["round 가 소수", { sessionId: SESSION_ID, round: 1.5 }, "round"],
    ["round 가 문자열", { sessionId: SESSION_ID, round: "a" }, "round"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("recommend-topics 도메인 규칙과 응답", () => {
  test("이용권이 없으면 403 NO_ENTITLEMENT 이다", async () => {
    const supabase = createFakeSupabase(
      createFakeDb({
        rpcs: {
          fn_tenant_usage_state: () => [{ allowed: false, deny_reason: null }],
          fn_program_access_state: () => [
            {
              allowed: false,
              program_key: "suhaeng",
              reason: null,
              expires_at: null,
            },
          ],
        },
      }),
    );
    Object.assign(supabase.auth, {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    });
    state.db = supabase;
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: SESSION_ID },
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });

  test("진행 상태와 맞지 않는 회차는 400 INVALID_ROUND 와 expectedRound 를 그대로 낸다", async () => {
    state.db = rowsDb({
      performance_sessions: [sessionRow],
      performance_topics: [],
    });
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: SESSION_ID, round: 2 },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "INVALID_ROUND",
      detail: "요청한 회차가 진행 상태와 맞지 않습니다.",
      expectedRound: 1,
      charged: false,
    });
  });

  test("이미 만든 회차를 다시 요청하면 저장분을 돌려주고 응답이 스키마를 통과한다", async () => {
    state.db = rowsDb({
      performance_sessions: [sessionRow],
      performance_topics: [
        {
          id: "t1",
          round: 1,
          idx: 0,
          title: "주제",
          subtitle: null,
          tags: [],
          detail: [],
          selected: false,
        },
      ],
    });
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: SESSION_ID, round: 1 },
    });
    expect(res.status).toBe(200);
    expect(recommendTopicsResponse.parse(res.body)).toMatchObject({
      round: 1,
      reused: true,
      charged: false,
    });
  });
});
