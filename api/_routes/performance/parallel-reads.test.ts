// 서로 기다릴 필요 없는 읽기가 함께 시작하는지 본다. 고른 읽기는 release() 전에는 끝나지 않는다.

import { afterEach, describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { gateReads } from "../../_lib/gatedReads.testkit.js";
import { rowsDb, SESSION_ID } from "../../_lib/performance/route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const TOPIC_ID = "5a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SUBMISSION_ID = "6b2d3c4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

const session = {
  id: SESSION_ID,
  profile_id: "me",
  status: "in_progress",
  selected_topic_id: TOPIC_ID,
  grade_label: "고1",
  semester: 1,
  subject_group: "과학",
  subject: "물리",
  career_goal: "연구원",
  created_at: "2026-11-06T00:00:00+00:00",
  updated_at: "2026-11-06T00:00:00+00:00",
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** 막아 둔 읽기가 모두 시작했는지 본 뒤 풀고 응답을 받는다. */
async function run(
  tables: Record<string, Record<string, unknown>[]>,
  gated: string[],
  request: () => ReturnType<typeof callRoute>,
  skipSession = true,
) {
  const { admin, gate } = gateReads(
    rowsDb(tables),
    (target) =>
      target.kind === "from" &&
      gated.includes(target.name) &&
      // 첫 읽기(세션)는 막지 않는다.
      !(skipSession && target.name === "performance_sessions"),
  );
  state.db = admin;
  const response = request();
  await vi.waitFor(() => expect(gate.started.length).toBeGreaterThan(0));
  await gate.settle();
  const started = [...gate.started].sort();
  gate.release();
  await response;
  return started;
}

describe("performance reports 상세", () => {
  test("주제 제목, 리포트, 제출본 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [session],
        performance_topics: [{ title: "주제" }],
        performance_reports: [],
        performance_submissions: [],
      },
      ["performance_topics", "performance_reports", "performance_submissions"],
      () =>
        callRoute(
          { app, path: "/api/performance/reports" },
          { query: { sessionId: SESSION_ID } },
        ),
    );

    expect(started).toEqual([
      "from:performance_reports",
      "from:performance_submissions",
      "from:performance_topics",
    ]);
  });
});

describe("performance finalize", () => {
  test("제출본 확인과 주제 제목 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [session],
        performance_submissions: [{ id: SUBMISSION_ID, fields: {} }],
        performance_topics: [{ title: "주제" }],
      },
      ["performance_submissions", "performance_topics"],
      () =>
        callRoute(
          { app, path: "/api/performance/finalize" },
          {
            method: "POST",
            body: {
              sessionId: SESSION_ID,
              submissionId: SUBMISSION_ID,
              action: "confirm",
            },
          },
        ),
    );

    expect(started).toEqual([
      "from:performance_submissions",
      "from:performance_topics",
    ]);
  });
});

describe("performance design-report 게이트", () => {
  test("주제 확인, 기존 설계 리포트, 차감 여부 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [session],
        performance_topics: [{ id: TOPIC_ID }],
        performance_reports: [],
        performance_credit_ledger: [{ session_id: SESSION_ID }],
      },
      [
        "performance_topics",
        "performance_reports",
        "performance_credit_ledger",
      ],
      () =>
        callRoute(
          { app, path: "/api/performance/design-report" },
          {
            method: "POST",
            body: { sessionId: SESSION_ID, topicId: TOPIC_ID },
          },
        ),
    );

    expect(started).toEqual([
      "from:performance_credit_ledger",
      "from:performance_reports",
      "from:performance_topics",
    ]);
  });
});

describe("performance evaluate 게이트", () => {
  test("제출본, 평가 리포트, 설계 리포트, 차감 여부 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [session],
        performance_submissions: [{ id: SUBMISSION_ID, fields: {} }],
        performance_reports: [],
        performance_credit_ledger: [{ session_id: SESSION_ID }],
      },
      [
        "performance_submissions",
        "performance_reports",
        "performance_credit_ledger",
      ],
      () =>
        callRoute(
          { app, path: "/api/performance/evaluate" },
          {
            method: "POST",
            body: { sessionId: SESSION_ID, submissionId: SUBMISSION_ID },
          },
        ),
    );

    expect(started).toEqual([
      "from:performance_credit_ledger",
      "from:performance_reports",
      "from:performance_reports",
      "from:performance_submissions",
    ]);
  });
});

describe("performance recommend-topics 게이트", () => {
  test("기존 라운드 읽기와 차감 여부 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [{ ...session, guide_json: { text: "안내문" } }],
        performance_topics: [],
        performance_credit_ledger: [{ session_id: SESSION_ID }],
      },
      ["performance_topics", "performance_credit_ledger"],
      () =>
        callRoute(
          { app, path: "/api/performance/recommend-topics" },
          { method: "POST", body: { sessionId: SESSION_ID } },
        ),
    );

    expect(started).toEqual([
      "from:performance_credit_ledger",
      "from:performance_topics",
    ]);
  });
});

describe("performance bootstrap", () => {
  test("프로필 읽기와 최근 세션 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [],
        profiles: [{ id: "me", name: "학생" }],
      },
      ["profiles", "performance_sessions"],
      () => callRoute({ app, path: "/api/performance/bootstrap" }, {}),
      false,
    );

    expect(started).toEqual(["from:performance_sessions", "from:profiles"]);
  });
});

describe("performance session 생성", () => {
  test("회차 스냅샷 읽기와 미차감 세션 읽기를 함께 시작한다", async () => {
    const started = await run(
      {
        performance_sessions: [],
        program_access: [],
        performance_credit_ledger: [],
      },
      ["performance_sessions", "program_access"],
      () =>
        callRoute(
          { app, path: "/api/performance/session" },
          { method: "POST", body: { action: "create" } },
        ),
      false,
    );

    expect(started).toEqual([
      "from:performance_sessions",
      "from:program_access",
    ]);
  });
});
