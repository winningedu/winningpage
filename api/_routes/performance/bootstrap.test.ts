import { describe, expect, test, vi } from "vitest";
import { bootstrapResponse } from "../../../shared/performance/bootstrap.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeDb,
  createFakeSupabase,
} from "../../_lib/fakeSupabase.testkit.js";
import { rowsDb, SESSION_ID } from "./route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const route = { app, path: "/api/performance/bootstrap" };

describe("bootstrap 도메인 규칙과 응답", () => {
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
    const res = await callRoute(route);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });

  test("재방문 응답이 스키마를 통과하고 세션 요약이 재개 단계를 가진다", async () => {
    state.db = rowsDb({
      profiles: [
        { id: "me", name: "학생", school_type: null, school_name: null },
      ],
      performance_sessions: [
        {
          id: SESSION_ID,
          status: "in_progress",
          current_step: 2,
          completed_steps: [1],
          grade_label: "고1",
          semester: "1학기",
          school_type: null,
          subject_group: "과학",
          subject: "물리",
          career_goal: "연구원",
          previous_topic: null,
          guide_input_mode: null,
          selected_topic_id: null,
          created_at: "2026-11-26T00:00:00Z",
          updated_at: "2026-11-27T00:00:00Z",
        },
      ],
      performance_reports: [],
      performance_topics: [],
    });
    const res = await callRoute(route);
    expect(res.status).toBe(200);
    const parsed = bootstrapResponse.parse(res.body);
    expect(parsed.profile.name).toBe("학생");
    expect(parsed.lastSession).toMatchObject({
      sessionId: SESSION_ID,
      resumeStep: 2,
    });
  });
});
