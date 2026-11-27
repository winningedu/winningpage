import { describe, expect, test, vi } from "vitest";
import {
  reportDetailResponse,
  reportsListResponse,
} from "../../../shared/performance/reports.js";
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

const route = { app, path: "/api/performance/reports" };

describe("reports 요청 형식", () => {
  test.each([
    ["sessionId 가 uuid 아님", { sessionId: "x" }, "sessionId"],
    ["cursor 가 날짜 아님", { cursor: "zzz" }, "cursor"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, query, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { query });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );
});

describe("reports 응답", () => {
  test("목록 응답이 스키마를 통과한다", async () => {
    state.db = rowsDb({
      performance_sessions: [{ id: SESSION_ID }],
      v_performance_saved_reports: [
        {
          session_id: SESSION_ID,
          topic_title: "주제",
          grade_label: "고1",
          subject_group: "과학",
          subject: "물리",
          career_goal: "연구원",
          updated_at: "2026-11-06T00:00:00+00:00",
          has_design: true,
          has_evaluation: false,
          has_final: false,
          design_report_id: "d1",
          evaluation_report_id: null,
          final_report_id: null,
        },
      ],
    });
    const res = await callRoute(route);
    expect(res.status).toBe(200);
    const parsed = reportsListResponse.parse(res.body);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBeNull();
  });

  test("상세 응답이 스키마를 통과한다", async () => {
    state.db = rowsDb({
      performance_sessions: [
        {
          id: SESSION_ID,
          status: "in_progress",
          grade_label: "고1",
          semester: "1학기",
          subject_group: "과학",
          subject: "물리",
          career_goal: "연구원",
          selected_topic_id: null,
          created_at: "2026-11-05T00:00:00Z",
          updated_at: "2026-11-06T00:00:00Z",
        },
      ],
      performance_reports: [],
      performance_submissions: [],
    });
    const res = await callRoute(route, { query: { sessionId: SESSION_ID } });
    expect(res.status).toBe(200);
    expect(() => reportDetailResponse.parse(res.body)).not.toThrow();
  });
});
