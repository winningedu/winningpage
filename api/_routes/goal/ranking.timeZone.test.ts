// 랭킹의 "오늘"은 요청한 학생의 현지 하루다(서버 UTC 기준 아님).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  getStudentTimeZone: vi.fn(),
}));
vi.mock("../../_lib/goal/repo.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

vi.mock("../../_lib/httpAuth.js", () => ({
  resolveUser: async () => ({ userId: "u1", user: { id: "u1" }, token: "t" }),
}));
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({}),
}));

import { rankingResponse } from "../../../shared/goal/ranking.js";
import { callGoal } from "../../_lib/goal/route.testkit.js";

const submittedOnFilters: unknown[] = [];

function fakeAdmin() {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, value: unknown) => {
        if (col === "submitted_on") submittedOnFilters.push(value);
        return q;
      },
      in: () => q,
      // biome-ignore lint/suspicious/noThenProperty: supabase 쿼리 빌더는 thenable 이다.
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: table === "goal_students" ? [] : [], error: null }),
    };
    return q;
  };
  return { from: builder };
}

async function get() {
  const { body } = await callGoal("ranking");
  return body as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));
  submittedOnFilters.length = 0;
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: fakeAdmin(),
    profileId: "p1",
  });
});

afterEach(() => vi.useRealTimers());

describe("GET /api/goal/ranking 오늘", () => {
  test("서울 학생 기준 오늘은 2026-11-23", async () => {
    repo.getStudentTimeZone.mockResolvedValue("Asia/Seoul");
    const body = await get();
    expect(body?.date).toBe("2026-11-23");
    expect(submittedOnFilters).toEqual(["2026-11-23"]);
  });

  test("LA 학생 기준 오늘은 2026-11-22", async () => {
    repo.getStudentTimeZone.mockResolvedValue("America/Los_Angeles");
    const body = await get();
    expect(body?.date).toBe("2026-11-22");
    expect(submittedOnFilters).toEqual(["2026-11-22"]);
  });
});

describe("GET /api/goal/ranking 응답 계약", () => {
  test("활성 학생이 모자라면 visible false 를 ok 필드와 problem 필드 없이 준다", async () => {
    repo.getStudentTimeZone.mockResolvedValue("Asia/Seoul");
    const r = await callGoal("ranking");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).not.toHaveProperty("ok");
    expect(r.body).not.toHaveProperty("code");
    expect(rankingResponse.parse(r.body)).toMatchObject({
      visible: false,
      top: [],
      me: null,
    });
  });

  test("이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await callGoal("ranking");
    expect(rankingResponse.parse(r.body)).toEqual({ allowed: false });
  });
});
