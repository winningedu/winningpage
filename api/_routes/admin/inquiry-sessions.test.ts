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

import { inquirySessionsPage } from "../../../shared/inquiry-session/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/inquiry-sessions" };

const PROFILE = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const ROW = {
  id: "r-1",
  profile_id: PROFILE,
  status: "archived",
  current_step: 2,
  area: "subject",
  subject: "수학",
  activity_name: null,
  selected_topic_id: "t-1",
  completed_at: null,
  last_activity_at: "2026-11-24T00:00:00.000Z",
  ledger_id: null,
  ledger_reversed_at: null,
  generation_state: {},
  evaluation_count: 3,
  topic_round_count: 1,
};

let reports: Respond;
let profiles: Respond;
let topics: Respond;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "inquirySessions", level }] : [],
    tables: {
      inquiry_sessions: (q) => reports(q),
      profiles: (q) => profiles(q),
      inquiry_topics: (q) => topics(q),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  topics = () => ({
    data: [{ id: "t-1", detail: { title: "미분의 활용" } }],
    error: null,
  });
  reports = () => ({ data: [ROW], error: null, count: 41 });
  profiles = () => ({
    data: [{ id: PROFILE, name: "김하늘", email: "a@b.c" }],
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (query: Record<string, string> = {}) =>
  callRoute(handler, { query });

describe("GET /api/admin/inquiry-sessions", () => {
  test("view 권한이면 ok 없이 items, total, page, pageSize 를 돌려준다", async () => {
    const admin = setup();
    const r = await get({ page: "2", pageSize: "10", status: "archived" });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(inquirySessionsPage.parse(r.body)).toEqual(r.body);
    const body = r.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("ok");
    expect(body).toMatchObject({ total: 41, page: 2, pageSize: 10 });
    expect((body.items as Record<string, unknown>[])[0]).toMatchObject({
      id: "r-1",
      profileId: PROFILE,
      studentName: "김하늘",
      email: "a@b.c",
      status: "archived",
      subject: "수학",
      topicTitle: "미분의 활용",
      evaluationCount: 3,
      topicRoundCount: 1,
    });
    const query = firstQuery(admin, "inquiry_sessions");
    expect(argsOf(query, "eq")).toEqual(["status", "archived"]);
    expect(argsOf(query, "range")).toEqual([10, 19]);
    expect(callsOf(query, "order").map((c) => c.args[0])).toEqual([
      "last_activity_at",
      "id",
    ]);
  });

  test("q 는 profiles 를 먼저 찾아 profile_id 로 거른다", async () => {
    const admin = setup();
    profiles = (q) =>
      argsOf(q, "or")
        ? { data: [{ id: PROFILE }], error: null }
        : { data: [{ id: PROFILE, name: "김", email: null }], error: null };
    const r = await get({ q: "김_%" });
    expect(r.status).toBe(200);
    const search = admin.queries.find(
      (x) => x.table === "profiles" && argsOf(x, "or"),
    );
    expect(argsOf(search as never, "or")).toEqual([
      "name.ilike.%김\\_\\%%,email.ilike.%김\\_\\%%",
    ]);
    expect(argsOf(firstQuery(admin, "inquiry_sessions"), "in")).toEqual([
      "profile_id",
      [PROFILE],
    ]);
  });

  test("q 에 맞는 프로필이 없으면 세션을 읽지 않고 빈 목록을 돌려준다", async () => {
    const admin = setup();
    profiles = () => ({ data: [], error: null });
    const r = await get({ q: "없음" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(admin.queries.map((x) => x.table)).not.toContain("inquiry_sessions");
  });

  test("page 가 올바르지 않으면 400 INVALID_QUERY 이고 읽지 않는다", async () => {
    const admin = setup();
    const r = await get({ page: "0" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_QUERY");
    expect((r.body as { detail: string }).detail).toBe(
      "page 가 올바르지 않습니다.",
    );
    expect(admin.queries.map((x) => x.table)).not.toContain("inquiry_sessions");
  });

  test("status 가 모르는 값이면 400 INVALID_QUERY 다", async () => {
    setup();
    const r = await get({ status: "bogus" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_QUERY");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("POST 는 405 METHOD_NOT_ALLOWED 다", async () => {
    setup("edit");
    const r = await callRoute(handler, { method: "POST" });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD");
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
  });

  test("조회 오류는 500 INTERNAL_ERROR 이고 문구는 그대로다", async () => {
    setup();
    reports = () => ({ data: null, error: { message: "boom" } });
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
    expect((r.body as { detail: string }).detail).toBe(
      "심화탐구 세션 조회에 실패했습니다.",
    );
  });
});
