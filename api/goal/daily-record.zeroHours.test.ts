// 사 #49 — 스쿨멘토에서만 0시간 기록을 저장한다. 핸들러를 repo 경계에서 mock 해 POST 경로를 돌린다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  narrowGoalSession: vi.fn((s: unknown) => s),
  fetchStudentRow: vi.fn(),
  fetchTodayRecord: vi.fn(),
  fetchTimerDaySummary: vi.fn(),
  fetchLatestDailyRecord: vi.fn(),
  upsertDailyRecord: vi.fn(),
  fetchStudentStateRow: vi.fn(),
  appendProbabilityLog: vi.fn(),
}));
vi.mock("../_lib/goal/repo.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

import handler from "./daily-record.js";

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function post(body: Record<string, unknown>) {
  const res = makeRes();
  await handler(
    { method: "POST", body } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return res;
}

const FULL_DAY = { ideal: 4, min: 2 };
const schedule = Object.fromEntries(
  ["월", "화", "수", "목", "금", "토", "일"].map((d) => [d, FULL_DAY]),
);

beforeEach(() => {
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
  vi.unstubAllEnvs();
});

const ZERO = {
  bodyCondition: "normal",
  tasks: ["concept"],
  studyHours: 0,
};

describe("daily-record POST 0시간", () => {
  test("스쿨멘토는 0시간을 저장하고 delta는 전부 0이다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const res = await post(ZERO);
    expect(res.statusCode).toBe(200);
    expect(repo.upsertDailyRecord.mock.calls[0]?.[1]).toMatchObject({
      study_hours: 0,
      delta_ideal_susi: 0,
      delta_ideal_jungsi: 0,
      delta_min_susi: 0,
      delta_min_jungsi: 0,
    });
    expect((res.body as { delta: unknown }).delta).toEqual({
      idealSusi: 0,
      idealJungsi: 0,
      minSusi: 0,
      minJungsi: 0,
    });
  });

  test("스쿨멘토도 목표가 0인 날 0시간은 확률을 올리지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    repo.fetchStudentRow.mockResolvedValue({
      onboarded_at: "2026-01-01",
      status: "active",
      actual_start_date: "2026-01-01",
      study_schedule: Object.fromEntries(
        Object.keys(schedule).map((d) => [d, { ideal: 0, min: 0 }]),
      ),
      rate_ideal_susi: 10,
      rate_ideal_jungsi: 10,
      rate_min_susi: 10,
      rate_min_jungsi: 10,
    });
    const res = await post(ZERO);
    expect(res.statusCode).toBe(200);
    expect(repo.upsertDailyRecord.mock.calls[0]?.[1]).toMatchObject({
      delta_ideal_susi: 0,
      delta_min_susi: 0,
    });
  });

  test("스쿨멘토도 음수와 24 초과는 400이다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    for (const studyHours of [-1, 25]) {
      const res = await post({ ...ZERO, studyHours });
      expect(res.statusCode).toBe(400);
    }
    expect(repo.upsertDailyRecord).not.toHaveBeenCalled();
  });

  test("위닝은 0시간을 no_study_time 400으로 막는다", async () => {
    vi.stubEnv("SITE", "winning");
    const res = await post(ZERO);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ reason: "no_study_time" });
    expect(repo.upsertDailyRecord).not.toHaveBeenCalled();
  });

  test("SITE 미설정도 0시간을 막는다", async () => {
    vi.stubEnv("SITE", "");
    const res = await post(ZERO);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ reason: "no_study_time" });
  });
});
