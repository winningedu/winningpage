// GET /api/admin/selfeval-sessions/:id 계약 검증. 세션 한 건 상세.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { selfevalSessionDetail } from "../../../shared/selfeval-session/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/selfeval-sessions/:id" };

const SID = "123e4567-e89b-42d3-a456-426614174000";
const PID = "223e4567-e89b-42d3-a456-426614174000";

const SESSION = {
  id: SID,
  profile_id: PID,
  status: "archived",
  current_step: 3,
  academic_year: 2026,
  semester: 1,
  area: "교과",
  subject: "수학",
  activity_name: "탐구",
  regenerate_count: 0,
  ledger_id: null,
  ledger_reversed_at: null,
  step_state: {},
  last_activity_at: "2026-11-01T00:00:00.000Z",
  completed_at: null,
};

let sessions: Respond = () => ({ data: SESSION, error: null });
const activities: Respond = () => ({
  data: [
    {
      activity_record_id: "a1",
      role: "main",
      fit_score: 0.9,
      analysis_source: "ai",
    },
  ],
  error: null,
});
const reports: Respond = () => ({
  data: [
    {
      id: "r1",
      report_type: "final",
      revision: 1,
      score: 80,
      created_at: "2026-11-02T00:00:00.000Z",
    },
  ],
  error: null,
});

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "selfevalSessions", level }] : [],
    tables: {
      selfeval_sessions: (q) => sessions(q),
      selfeval_session_activities: (q) => activities(q),
      selfeval_reports: (q) => reports(q),
      profiles: () => ({
        data: [{ id: PID, name: "김학생", email: "a@b.c" }],
        error: null,
      }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

describe("GET /api/admin/selfeval-sessions/:id", () => {
  const get = (query: Record<string, string> = { id: SID }) =>
    callRoute(handler, { query });

  test("view 권한이면 ok 없이 상세를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(selfevalSessionDetail.parse(r.body)).toEqual(r.body);
    const body = r.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("ok");
    expect(Object.keys(body).sort()).toEqual(
      [
        "activities",
        "email",
        "progress",
        "reports",
        "session",
        "studentName",
        "terminal",
      ].sort(),
    );
    expect(body.studentName).toBe("김학생");
    expect(body.activities).toEqual([
      {
        activityRecordId: "a1",
        role: "main",
        fitScore: 0.9,
        analysisSource: "ai",
      },
    ]);
    expect(body.reports).toEqual([
      {
        id: "r1",
        type: "final",
        revision: 1,
        score: 80,
        createdAt: "2026-11-02T00:00:00.000Z",
      },
    ]);
    expect(argsOf(firstQuery(admin, "selfeval_sessions"), "eq")).toEqual([
      "id",
      SID,
    ]);
  });

  test("edit 권한도 읽는다", async () => {
    setup("edit");
    expect((await get()).status).toBe(200);
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("id 가 uuid 가 아니면 400 이다", async () => {
    setup();
    const r = await get({ id: "x" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test("없는 세션은 404 SESSION_NOT_FOUND 다", async () => {
    setup();
    sessions = () => ({ data: null, error: null });
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("SESSION_NOT_FOUND");
    expect((r.body as { detail?: string }).detail).toBe(
      "세션을 찾을 수 없습니다.",
    );
  });

  test("DB 오류는 500 이다", async () => {
    setup();
    sessions = () => ({ data: null, error: { message: "boom" } });
    expect((await get()).status).toBe(500);
  });
});
