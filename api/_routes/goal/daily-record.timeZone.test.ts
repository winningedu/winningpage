// 학생의 오늘(record_date, submitted_on)이 profiles.time_zone 의 현지 날짜인지 고정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  narrowGoalSession: vi.fn((s: unknown) => s),
  getStudentTimeZone: vi.fn(),
  fetchStudentRow: vi.fn(),
  fetchTodayRecord: vi.fn(),
  fetchTimerDaySummary: vi.fn(),
  fetchLatestDailyRecord: vi.fn(),
  upsertDailyRecord: vi.fn(),
  fetchStudentStateRow: vi.fn(),
  appendProbabilityLog: vi.fn(),
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

async function post() {
  const { status: statusCode, body } = await callGoal("daily-record", {
    method: "POST",
    body: { bodyCondition: "normal", tasks: ["concept"], studyHours: 3 },
  });
  return { statusCode, body };
}

const FULL_DAY = { ideal: 4, min: 2 };
const schedule = Object.fromEntries(
  ["월", "화", "수", "목", "금", "토", "일"].map((d) => [d, FULL_DAY]),
);

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
    onboarded_at: "2026-01-01",
    status: "active",
    actual_start_date: "2026-01-01",
    study_schedule: schedule,
    rate_ideal_susi: 10,
    rate_ideal_jungsi: 10,
    rate_min_susi: 10,
    rate_min_jungsi: 10,
  });
  repo.fetchTodayRecord.mockResolvedValue(null);
  repo.fetchLatestDailyRecord.mockResolvedValue(null);
  repo.fetchTimerDaySummary.mockResolvedValue({ totalSeconds: 0 });
  repo.fetchStudentStateRow.mockResolvedValue({ record_count: 1 });
  repo.upsertDailyRecord.mockImplementation(
    async (_db: unknown, payload: Record<string, unknown>) => ({
      id: "r1",
      ...payload,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("daily-record POST 학생 시간대", () => {
  test("서울 학생이 2026-11-22T15:30Z 에 제출하면 record_date 는 2026-11-23", async () => {
    repo.getStudentTimeZone.mockResolvedValue("Asia/Seoul");
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(repo.upsertDailyRecord.mock.calls[0]?.[1]).toMatchObject({
      record_date: "2026-11-23",
      submitted_on: "2026-11-23",
    });
  });

  test("LA 학생이 같은 순간에 제출하면 record_date 는 2026-11-22", async () => {
    repo.getStudentTimeZone.mockResolvedValue("America/Los_Angeles");
    const res = await post();
    expect(res.statusCode).toBe(200);
    expect(repo.upsertDailyRecord.mock.calls[0]?.[1]).toMatchObject({
      record_date: "2026-11-22",
      submitted_on: "2026-11-22",
    });
  });
});
