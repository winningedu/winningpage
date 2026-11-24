// GET /api/admin/selfeval-sessions 계약 검증. 목록만 다룬다(상세는 selfeval-sessions/[id]).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
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

import handler from "./selfeval-sessions.js";

const SID = "123e4567-e89b-42d3-a456-426614174000";
const PID = "223e4567-e89b-42d3-a456-426614174000";

const ROW = {
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

let sessions: Respond = () => ({ data: [ROW], error: null, count: 1 });
let profiles: Respond = () => ({
  data: [{ id: PID, name: "김학생", email: "a@b.c" }],
  error: null,
});

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "selfevalSessions", level }] : [],
    tables: {
      selfeval_sessions: (q) => sessions(q),
      profiles: (q) => profiles(q),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  sessions = () => ({ data: [ROW], error: null, count: 1 });
  profiles = () => ({
    data: [{ id: PID, name: "김학생", email: "a@b.c" }],
    error: null,
  });
});

describe("GET /api/admin/selfeval-sessions", () => {
  const get = (query: Record<string, string> = {}) =>
    callRoute(handler, { query });

  test("view 권한이면 ok 없이 { items, total, page, pageSize } 를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("ok");
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(body.items).toEqual([
      expect.objectContaining({
        id: SID,
        profileId: PID,
        studentName: "김학생",
        email: "a@b.c",
        status: "archived",
      }),
    ]);
    const query = firstQuery(admin, "selfeval_sessions");
    expect(argsOf(query, "range")).toEqual([0, 19]);
  });

  test("status 필터와 페이지를 range 와 eq 로 건다", async () => {
    const admin = setup();
    await get({ status: "archived", page: "2", pageSize: "5" });
    const query = firstQuery(admin, "selfeval_sessions");
    expect(argsOf(query, "eq")).toEqual(["status", "archived"]);
    expect(argsOf(query, "range")).toEqual([5, 9]);
  });

  test("sessionId 는 더 이상 상세를 뜻하지 않고 목록으로 처리한다", async () => {
    setup();
    const r = await get({ sessionId: SID });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("items");
  });

  test("view 권한으로도 GET 은 되고 POST 는 405 다", async () => {
    setup("view");
    const r = await callRoute(handler, { method: "POST" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
  });

  test("edit 권한도 GET 을 읽는다", async () => {
    setup("edit");
    expect((await get()).status).toBe(200);
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("status 가 허용 값이 아니면 400 INVALID_QUERY 다", async () => {
    setup();
    const r = await get({ status: "deleted" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_QUERY");
  });

  test("DB 오류는 500 problem 이다", async () => {
    setup();
    sessions = () => ({ data: null, error: { message: "boom" } });
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
