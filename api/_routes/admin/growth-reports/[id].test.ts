import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./[id].js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const PROFILE = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";

const ROW = {
  id: ID,
  profile_id: PROFILE,
  status: "in_progress",
  current_step: 1,
  track: null,
  issued_at: null,
  last_activity_at: "2026-11-24T00:00:00.000Z",
  ledger_id: null,
  ledger_reversed_at: null,
  step_state: {},
};

let reports: Respond;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "growthReports", level }] : [],
    tables: {
      growth_reports: (q) => reports(q),
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

describe("GET /api/admin/growth-reports/:id", () => {
  test("목록과 같은 항목 모양으로 한 회차를 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: ID,
      profileId: PROFILE,
      studentName: "김하늘",
      email: "a@b.c",
      status: "in_progress",
      currentStep: 1,
    });
    expect(r.body).toHaveProperty("progress");
    expect(r.body).not.toHaveProperty("ok");
    expect(argsOf(firstQuery(admin, "growth_reports"), "eq")).toEqual([
      "id",
      ID,
    ]);
  });

  test("없는 회차는 404 NOT_FOUND 다", async () => {
    reports = () => ({ data: null, error: null });
    setup();
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "회차를 찾을 수 없습니다.",
    );
  });

  test.each([
    ["id 없음", {}],
    ["uuid 가 아닌 id", { id: "abc" }],
  ])("%s 이면 400 VALIDATION_FAILED 다", async (_label, query) => {
    const admin = setup();
    const r = await get(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((x) => x.table)).not.toContain("growth_reports");
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
