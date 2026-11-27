// /api/goal/daily-record: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/daily-record.ts)이 막고, 온보딩 상태, 쿨다운, 순공 시간 규칙은 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  dailyRecordGetResponse,
  dailyRecordPostResponse,
  REASON_CODES,
  TASK_CODES,
} from "../../../shared/goal/daily-record.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchStudentRow: vi.fn(),
  fetchTodayRecord: vi.fn(),
  fetchLatestDailyRecord: vi.fn(),
  fetchStudentStateRow: vi.fn(),
  fetchTimerDaySummary: vi.fn(),
  getStudentTimeZone: vi.fn(),
  upsertDailyRecord: vi.fn(),
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
import { REASON_LABELS, TASK_LABELS } from "./daily-record.js";

const student = {
  onboarded_at: "2026-01-01T00:00:00Z",
  status: "active",
  actual_start_date: "2026-01-01",
  study_schedule: {},
  rate_ideal_susi: 1,
  rate_ideal_jungsi: 1,
  rate_min_susi: 1,
  rate_min_jungsi: 1,
};
const savedRow = {
  id: 5,
  record_index: 10,
  record_date: "2026-01-11",
  study_hours: 2,
  body_condition: "normal",
  tasks: ["개념 학습"],
  reasons: [],
  memo: "",
};
const call = (method: string, body?: unknown) =>
  callGoal("daily-record", { method, body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue(student);
  repo.fetchTodayRecord.mockResolvedValue(null);
  repo.fetchLatestDailyRecord.mockResolvedValue(null);
  repo.fetchStudentStateRow.mockResolvedValue({
    ideal_susi: 50,
    ideal_jungsi: null,
    min_susi: 40,
    min_jungsi: null,
    record_count: 3,
  });
  repo.fetchTimerDaySummary.mockResolvedValue({
    date: "2026-01-11",
    running: null,
    subjects: [{ subject: "math", seconds: 3600 }],
    totalSeconds: 3600,
  });
  repo.getStudentTimeZone.mockResolvedValue("UTC");
  repo.upsertDailyRecord.mockResolvedValue(savedRow);
});
afterEach(() => vi.restoreAllMocks());

describe("계약 코드가 서버 라벨 표와 같다", () => {
  test("TASK_CODES, REASON_CODES 는 TASK_LABELS, REASON_LABELS 의 키다", () => {
    expect([...TASK_CODES].sort()).toEqual(Object.keys(TASK_LABELS).sort());
    expect([...REASON_CODES].sort()).toEqual(Object.keys(REASON_LABELS).sort());
  });
});

describe("요청 형식", () => {
  test.each([
    ["컨디션이 목록에 없다", { bodyCondition: "bad" }],
    ["메모가 문자열이 아니다", { memo: 3 }],
    ["학습 항목이 배열이 아니다", { tasks: "concept" }],
    ["학습 항목에 모르는 코드가 있다", { tasks: ["unknown"] }],
    ["방해 요인에 모르는 코드가 있다", { reasons: ["unknown"] }],
    ["순공 시간이 숫자가 아니다", { studyHours: { a: 1 } }],
    ["순공 시간이 빈 문자열이다", { studyHours: "  " }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, body) => {
    const r = await call("POST", body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.upsertDailyRecord).not.toHaveBeenCalled();
  });
});

describe("도메인 규칙은 예전 코드와 문구를 지킨다", () => {
  test("온보딩 전이면 409 NOT_ONBOARDED 다", async () => {
    repo.fetchStudentRow.mockResolvedValue(null);
    const r = await call("POST", { studyHours: 2 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "NOT_ONBOARDED",
      reason: "not_onboarded",
    });
  });

  test("순공 시간이 0 이면 400 NO_STUDY_TIME 이다", async () => {
    repo.fetchTimerDaySummary.mockResolvedValue({
      subjects: [],
      totalSeconds: 0,
    });
    const r = await call("POST", { studyHours: 0 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "NO_STUDY_TIME",
      reason: "no_study_time",
    });
  });

  test("12시간 안의 재제출은 409 COOLDOWN 과 잠금 시각을 준다", async () => {
    repo.fetchLatestDailyRecord.mockResolvedValue({
      submitted_at: new Date().toISOString(),
    });
    const r = await call("POST", { studyHours: 2 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "COOLDOWN", reason: "cooldown" });
    expect(r.body).toHaveProperty("submittedAt");
    expect(r.body).toHaveProperty("unlocksAt");
  });
});

describe("동작", () => {
  test("GET 은 오늘 기록을 계약으로 준다", async () => {
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    const parsed = dailyRecordGetResponse.parse(r.body);
    expect(parsed).toMatchObject({
      record: { recordIndex: null, studyHours: 1 },
      probs: { idealSusi: 50, idealJungsi: null },
      cooldown: null,
      summary: null,
      subjectHours: [{ subject: "math", hours: 1 }],
    });
  });

  test("GET 이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("GET");
    expect(dailyRecordGetResponse.parse(r.body)).toEqual({ allowed: false });
  });

  test("POST 는 기록을 저장하고 record, delta, probs 를 계약으로 준다", async () => {
    const r = await call("POST", {
      studyHours: 2,
      bodyCondition: "normal",
      tasks: ["concept"],
      reasons: ["none"],
      memo: " 메모 ",
    });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    const parsed = dailyRecordPostResponse.parse(r.body);
    expect(parsed.recordCount).toBe(3);
    expect(parsed.record.recordIndex).toBe(10);
    expect(repo.upsertDailyRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tasks: ["개념 학습"],
        reasons: ["없었음"],
        memo: "메모",
      }),
    );
  });

  test("POST 순공 시간은 숫자 문자열도 받는다", async () => {
    const r = await call("POST", { studyHours: "2.5" });
    expect(r.status).toBe(200);
    expect(repo.upsertDailyRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ study_hours: 2.5 }),
    );
  });
});
