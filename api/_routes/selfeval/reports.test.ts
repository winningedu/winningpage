// GET /api/selfeval/reports: 진입과 목록, 세션 상세. Hono 라우트를 루트 앱으로 부른다.
// DB 읽기는 db.ts 함수를 가짜로 바꾼다. 응답은 계약 스키마(shared/selfeval)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";
import { entryResponseSchema } from "../../../shared/selfeval/reports.js";
import { sessionDetailResponseSchema } from "../../../shared/selfeval/session.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";
import type { SessionListRow, SessionRow } from "../../_lib/selfeval/rows.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  db: {} as Record<string, Mock<(...args: unknown[]) => unknown>>,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  countActivities: (...args: unknown[]) => kit.db.countActivities?.(...args),
  listSessions: (...args: unknown[]) => kit.db.listSessions?.(...args),
  loadGrowthSnapshot: (...args: unknown[]) =>
    kit.db.loadGrowthSnapshot?.(...args),
  loadLatestReportsByType: (...args: unknown[]) =>
    kit.db.loadLatestReportsByType?.(...args),
  loadMemberTimeZone: (...args: unknown[]) =>
    kit.db.loadMemberTimeZone?.(...args),
  loadReports: (...args: unknown[]) => kit.db.loadReports?.(...args),
  loadSession: (...args: unknown[]) => kit.db.loadSession?.(...args),
  loadSessionActivities: (...args: unknown[]) =>
    kit.db.loadSessionActivities?.(...args),
  loadSessionsWithReplyPending: (...args: unknown[]) =>
    kit.db.loadSessionsWithReplyPending?.(...args),
  loadStudentProfile: (...args: unknown[]) =>
    kit.db.loadStudentProfile?.(...args),
}));

vi.mock("../../_lib/selfeval/evidenceDb.js", () => ({
  loadIncludedMemos: async () => [
    { id: "m1", writtenAt: null, text: "수기 메모" },
  ],
}));

vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: async () => ({ allowed: true, tenantReason: null }),
  readSelfevalQuota: async () => ({
    quotaTotal: 3,
    quotaUsed: 1,
    quotaRemaining: 2,
    planEndsAt: null,
    planLabel: "기본",
  }),
}));

vi.mock("../../_lib/selfeval/reply.js", () => ({
  resendPendingReplies: async () => ({ resent: 1 }),
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/reports" };
const ID = "123e4567-e89b-12d3-a456-426614174000";

const listRow: SessionListRow = {
  id: ID,
  status: "in_progress",
  current_step: 3,
  academic_year: 2026,
  semester: 2,
  area: "subject",
  subject: "생명과학",
  activity_name: null,
  step_state: {},
  last_activity_at: "2026-10-05T00:00:00Z",
  completed_at: null,
};

const sessionRow: SessionRow = {
  ...listRow,
  profile_id: "admin-1",
  grade_label: "고2",
  school_prompt: null,
  teacher_note: null,
  target_chars: 500,
  target_chars_mode: "with_space",
  career: { career: null, department: null, universities: [] },
  growth_report_id: null,
  growth_applied: false,
  growth_snapshot: null,
  plan_item_id: null,
  reply_pending: null,
  regenerate_count: 1,
  ledger_id: null,
  ledger_reversed_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.db = {
    countActivities: vi.fn(async () => 2),
    listSessions: vi.fn(async () => [listRow]),
    loadGrowthSnapshot: vi.fn(async () => null),
    loadLatestReportsByType: vi.fn(async () => []),
    loadMemberTimeZone: vi.fn(async () => "Asia/Seoul"),
    loadReports: vi.fn(async () => []),
    loadSession: vi.fn(async () => sessionRow),
    loadSessionActivities: vi.fn(async () => []),
    loadSessionsWithReplyPending: vi.fn(async () => []),
    loadStudentProfile: vi.fn(async () => null),
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("GET /api/selfeval/reports 목록", () => {
  test("진입 정보와 목록을 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    const r = await callRoute(route);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    const parsed = entryResponseSchema.parse(r.body);
    expect(parsed.entry).toMatchObject({
      allowed: true,
      activityCount: 2,
      replyResent: 1,
      timeZone: "Asia/Seoul",
      openSession: { id: ID, route: "analysis" },
    });
    expect(parsed.sessions).toHaveLength(1);
  });

  test("회신 재전송이 실패해도 진입은 열리고 replyResent 는 0 이다", async () => {
    kit.db.loadSessionsWithReplyPending = vi.fn(async () => {
      throw new Error("db down");
    });
    const r = await callRoute(route);
    expect(r.status).toBe(200);
    expect(
      (r.body as { entry: { replyResent: number } }).entry.replyResent,
    ).toBe(0);
  });
});

describe("GET /api/selfeval/reports?sessionId 상세", () => {
  test("세션 상세를 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    const r = await callRoute(route, { query: { sessionId: ID } });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    const parsed = sessionDetailResponseSchema.parse(r.body);
    expect(parsed.session.id).toBe(ID);
    expect(parsed.memos).toEqual([
      { id: "m1", writtenAt: null, text: "수기 메모" },
    ]);
    expect(parsed.regenerationsLeft).toBe(2);
  });

  test("저장된 본문 jsonb 는 계약 스키마로 읽어 내보낸다", async () => {
    const sections = {
      paragraphs: [
        {
          sentences: [
            {
              id: "p1-s1",
              text: "측정했다.",
              evidence: { activityId: "a1", field: "method" },
              feeling: false,
              confirmed: false,
            },
          ],
        },
      ],
    };
    kit.db.loadReports = vi.fn(async () => [
      {
        id: "g1",
        session_id: ID,
        report_type: "generation",
        revision: 1,
        sections,
        char_count: { withSpace: 5, withoutSpace: 4 },
        score: null,
        mandatory_fixes: null,
        created_at: "2026-10-05T01:00:00Z",
      },
    ]);
    const r = await callRoute(route, { query: { sessionId: ID } });
    expect(r.status).toBe(200);
    const parsed = sessionDetailResponseSchema.parse(r.body);
    expect(
      parsed.current?.sections.paragraphs[0]?.sentences[0]?.evidence,
    ).toEqual([
      { sourceType: "P", refId: "a1", item: "method", weight: "main" },
    ]);
  });

  test("본문 jsonb 가 계약 모양이 아닌 행이 있으면 500 INTERNAL_ERROR 이고 그 값은 내보내지 않는다", async () => {
    kit.db.loadReports = vi.fn(async () => [
      {
        id: "g1",
        session_id: ID,
        report_type: "generation",
        revision: 1,
        sections: { paragraphs: "깨진 값" },
        char_count: { withSpace: 5, withoutSpace: 4 },
        score: null,
        mandatory_fixes: null,
        created_at: "2026-10-05T01:00:00Z",
      },
    ]);
    const r = await callRoute(route, { query: { sessionId: ID } });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "자기평가서를 불러오지 못했습니다.",
    });
    expect(JSON.stringify(r.body)).not.toContain("깨진 값");
  });

  test("없는 세션과 남의 세션은 같은 404 SESSION_NOT_FOUND problem 이다", async () => {
    kit.db.loadSession = vi.fn(async () => null);
    const r = await callRoute(route, { query: { sessionId: ID } });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      status: 404,
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("uuid 가 아닌 sessionId 는 400 VALIDATION_FAILED 다", async () => {
    const r = await callRoute(route, { query: { sessionId: "x" } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "sessionId" }],
    });
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이고 no-store 가 실린다", async () => {
    const r = await callRoute(route, { headers: { authorization: "" } });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  test("GET 이 아니면 405 와 Allow 다", async () => {
    const r = await callRoute(route, { method: "POST" });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD");
  });

  test("DB 오류는 500 problem 과 라우트 문구다", async () => {
    kit.db.countActivities = vi.fn(async () => {
      throw new Error("db down");
    });
    const r = await callRoute(route);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      status: 500,
      detail: "자기평가서를 불러오지 못했습니다.",
      code: "INTERNAL_ERROR",
    });
  });
});
