// POST /api/selfeval/session 의 create, update, discard 흐름. Hono 라우트를 루트 앱으로 부른다.
// DB 쓰기는 db.ts 함수를 가짜로 바꾼다. 응답은 계약 스키마(shared/selfeval/session.ts)로 읽는다.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";
import {
  sessionDiscardResponseSchema,
  sessionResponseSchema,
} from "../../../shared/selfeval/session.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";
import type { SessionRow } from "../../_lib/selfeval/rows.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  db: {} as Record<string, Mock<(...args: unknown[]) => unknown>>,
  access: { allowed: true, tenantReason: null as string | null },
  quota: { quotaRemaining: null as number | null },
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  insertSession: (...args: unknown[]) => kit.db.insertSession?.(...args),
  loadGrowthSnapshot: (...args: unknown[]) =>
    kit.db.loadGrowthSnapshot?.(...args),
  loadOpenSession: (...args: unknown[]) => kit.db.loadOpenSession?.(...args),
  loadSession: (...args: unknown[]) => kit.db.loadSession?.(...args),
  terminateSession: (...args: unknown[]) => kit.db.terminateSession?.(...args),
  updateSession: (...args: unknown[]) => kit.db.updateSession?.(...args),
}));

vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: async () => kit.access,
  readSelfevalQuota: async () => ({
    quotaTotal: null,
    quotaUsed: null,
    quotaRemaining: kit.quota.quotaRemaining,
    planEndsAt: null,
    planLabel: null,
  }),
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/session" };
const post = (body: unknown) => callRoute(route, { method: "POST", body });

const ID = "123e4567-e89b-12d3-a456-426614174000";

const CREATE = {
  action: "create",
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: " 생명과학 ",
  activityName: "무시",
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: null, department: null, universities: [] },
  growthApplied: false,
};

const sessionRow: SessionRow = {
  id: ID,
  profile_id: "admin-1",
  status: "draft",
  current_step: 1,
  academic_year: 2026,
  grade_label: "고2",
  semester: 1,
  area: "subject",
  subject: "생명과학",
  activity_name: null,
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
  regenerate_count: 0,
  step_state: {},
  ledger_id: null,
  ledger_reversed_at: null,
  last_activity_at: "2026-10-01T00:00:00Z",
  completed_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.access = { allowed: true, tenantReason: null };
  kit.quota = { quotaRemaining: null };
  kit.db = {
    insertSession: vi.fn(async () => ({ ok: true, session: sessionRow })),
    loadGrowthSnapshot: vi.fn(async () => null),
    loadOpenSession: vi.fn(async () => null),
    loadSession: vi.fn(async () => sessionRow),
    terminateSession: vi.fn(async () => ({ ok: true })),
    updateSession: vi.fn(async () => sessionRow),
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("create", () => {
  test("세션을 만들고 ok 필드 없이 session 을 돌려준다(계약 스키마로 읽힌다)", async () => {
    const r = await post(CREATE);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    expect(sessionResponseSchema.parse(r.body).session.id).toBe(ID);
    // 영역에 맞지 않는 활동명은 버리고, 입력은 trim 해서 저장한다.
    expect(kit.db.insertSession?.mock.calls[0]?.[1]).toMatchObject({
      subject: "생명과학",
      activity_name: null,
      status: "draft",
    });
  });

  test("바디가 잘못되면 400 VALIDATION_FAILED 이고 필드 경로를 준다(이용권 확인보다 먼저)", async () => {
    kit.access = { allowed: false, tenantReason: null };
    const r = await post({ ...CREATE, gradeLabel: "고4" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "gradeLabel" }],
    });
  });

  test("열린 세션이 있으면 409 SESSION_OPEN 과 openSessionId 확장 멤버다", async () => {
    kit.db.loadOpenSession = vi.fn(async () => ({ id: "open-1" }));
    const r = await post(CREATE);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_OPEN",
      detail: "작성 중인 자기평가서가 있어요. 이어서 쓰거나 파기해 주세요.",
      openSessionId: "open-1",
    });
    expect(kit.db.insertSession).not.toHaveBeenCalled();
  });

  test("동시에 다른 세션이 열려 insert 가 막히면 같은 409 SESSION_OPEN 이다", async () => {
    kit.db.insertSession = vi.fn(async () => ({ ok: false }));
    kit.db.loadOpenSession = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "open-2" });
    const r = await post(CREATE);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_OPEN",
      openSessionId: "open-2",
    });
  });

  test("남은 횟수가 0 이면 409 QUOTA_EXHAUSTED 다", async () => {
    kit.quota = { quotaRemaining: 0 };
    const r = await post(CREATE);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "QUOTA_EXHAUSTED" });
  });

  test("성장설계에 없는 실행계획 항목은 400 PLAN_ITEM_INVALID 다", async () => {
    const r = await post({ ...CREATE, planItemId: "nope" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "PLAN_ITEM_INVALID",
      detail: "선택한 실행계획 항목을 쓸 수 없어요.",
    });
  });
});

describe("update", () => {
  const update = (patch: Record<string, unknown> = {}) =>
    post({ action: "update", sessionId: ID, targetChars: 800, ...patch });

  test("보낸 필드만 고치고 session 을 돌려준다", async () => {
    kit.db.updateSession = vi.fn(async () => ({
      ...sessionRow,
      target_chars: 800,
    }));
    const r = await update();
    expect(r.status).toBe(200);
    expect(sessionResponseSchema.parse(r.body).session.targetChars).toBe(800);
    expect(kit.db.updateSession?.mock.calls[0]?.[3]).toMatchObject({
      target_chars: 800,
      subject: "생명과학",
    });
  });

  test("없는 세션은 404 SESSION_NOT_FOUND 다", async () => {
    kit.db.loadSession = vi.fn(async () => null);
    const r = await update();
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  test("활동을 고른 뒤에는 409 SESSION_LOCKED 다", async () => {
    kit.db.loadSession = vi.fn(async () => ({
      ...sessionRow,
      current_step: 2,
    }));
    const r = await update();
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "SESSION_LOCKED" });
  });

  test("합친 값이 영역 규칙에 어긋나면 400 VALIDATION_FAILED 다", async () => {
    const r = await update({ area: "club" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "activityName", message: "활동명을 입력해 주세요." }],
    });
    expect(kit.db.updateSession).not.toHaveBeenCalled();
  });

  test("합친 값의 실행계획 항목이 스냅샷에 없으면 400 PLAN_ITEM_INVALID 다", async () => {
    const r = await update({ planItemId: "nope" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "PLAN_ITEM_INVALID" });
  });
});

describe("discard", () => {
  const discard = () => post({ action: "discard", sessionId: ID });

  test("파기하면 빈 객체를 돌려준다(차감은 되돌리지 않는다)", async () => {
    const r = await discard();
    expect(r.status).toBe(200);
    expect(sessionDiscardResponseSchema.parse(r.body)).toEqual({});
    expect(kit.db.terminateSession?.mock.calls[0]?.slice(2)).toEqual([
      ID,
      null,
      "discarded",
    ]);
  });

  test("없는 세션은 404, 이미 닫힌 세션은 409 SESSION_NOT_OPEN 이다", async () => {
    kit.db.terminateSession = vi.fn(async () => ({
      ok: false,
      reason: "not_found",
    }));
    expect((await discard()).body).toMatchObject({
      status: 404,
      code: "SESSION_NOT_FOUND",
    });
    kit.db.terminateSession = vi.fn(async () => ({
      ok: false,
      reason: "not_open",
    }));
    const r = await discard();
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 닫힌 세션이에요.",
    });
  });
});

describe("인증, 메서드, 오류", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED 다", async () => {
    const r = await callRoute(route, {
      method: "POST",
      body: CREATE,
      headers: { authorization: "" },
    });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("POST 가 아니면 405 와 Allow POST 다", async () => {
    const r = await callRoute(route);
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("POST");
  });

  test("DB 오류는 500 problem 과 라우트 문구다", async () => {
    kit.db.loadOpenSession = vi.fn(async () => {
      throw new Error("db down");
    });
    const r = await post(CREATE);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      detail: "자기평가서 세션 처리에 실패했습니다.",
      code: "INTERNAL_ERROR",
    });
  });
});
