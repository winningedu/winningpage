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

import { inquirySession } from "../../../shared/inquiry-session/contract.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/inquiry-sessions/:id" };

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const PROFILE = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

const ROW = {
  id: ID,
  profile_id: PROFILE,
  status: "in_progress",
  current_step: 1,
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

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "inquirySessions", level }] : [],
    tables: {
      inquiry_sessions: (q) => reports(q),
      inquiry_topics: () => ({
        data: [{ id: "t-1", detail: { title: "미분의 활용" } }],
        error: null,
      }),
      profiles: () => ({
        data: [{ id: PROFILE, name: "김하늘", email: "a@b.c" }],
        error: null,
      }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  reports = () => ({ data: ROW, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (query: Record<string, string> = { id: ID }) =>
  callRoute(handler, { query });

describe("GET /api/admin/inquiry-sessions/:id", () => {
  test("목록과 같은 항목 모양으로 한 회차를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(inquirySession.parse(r.body)).toEqual(r.body);
    expect(r.body).toMatchObject({
      id: ID,
      profileId: PROFILE,
      studentName: "김하늘",
      email: "a@b.c",
      status: "in_progress",
      currentStep: 1,
    });
    expect(r.body).toMatchObject({
      subject: "수학",
      topicTitle: "미분의 활용",
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(argsOf(firstQuery(admin, "inquiry_sessions"), "eq")).toEqual([
      "id",
      ID,
    ]);
  });

  test("없는 세션은 404 NOT_FOUND 다", async () => {
    reports = () => ({ data: null, error: null });
    setup();
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "세션을 찾을 수 없어요.",
    );
  });

  test("uuid 가 아닌 id 이면 400 VALIDATION_FAILED 다", async () => {
    const admin = setup();
    const r = await get({ id: "abc" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((x) => x.table)).not.toContain("inquiry_sessions");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    reports = () => ({ data: null, error: { message: "boom" } });
    setup();
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
