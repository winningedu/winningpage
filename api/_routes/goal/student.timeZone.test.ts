// GET /api/goal/student 가 학생 시간대를 싣고, 최근 7일 창을 학생 현지 날짜로 자르는지 고정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  narrowGoalSession: vi.fn((s: unknown) => s),
  getStudentTimeZone: vi.fn(),
  fetchStudentRow: vi.fn(),
  fetchStudentStateRow: vi.fn(),
  fetchProbabilityHistory: vi.fn(),
  fetchProfileName: vi.fn(),
  fetchRecordsInRange: vi.fn(),
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

import { callGoal } from "../../_lib/goal/route.testkit.js";

async function get() {
  const { body } = await callGoal("student");
  return body as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.narrowGoalSession.mockImplementation((s: unknown) => s);
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue({
    status: "active",
    onboarded_at: "2026-01-01",
    school_type: "high",
    ideal_jungsi_cut: 1,
    min_jungsi_cut: 1,
  });
  repo.fetchStudentStateRow.mockResolvedValue(null);
  repo.fetchProbabilityHistory.mockResolvedValue([]);
  repo.fetchProfileName.mockResolvedValue("학생");
  repo.fetchRecordsInRange.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("GET /api/goal/student 시간대", () => {
  test("응답에 학생의 IANA 시간대를 싣는다", async () => {
    repo.getStudentTimeZone.mockResolvedValue("America/Los_Angeles");
    const body = await get();
    expect(body?.timeZone).toBe("America/Los_Angeles");
  });

  test("최근 7일 창의 끝은 학생 현지 오늘이다", async () => {
    repo.getStudentTimeZone.mockResolvedValue("Asia/Seoul");
    await get();
    expect(repo.fetchRecordsInRange).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      "2026-11-17",
      "2026-11-23",
    );
  });
});
