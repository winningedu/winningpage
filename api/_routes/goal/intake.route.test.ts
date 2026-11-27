// /api/goal/intake: Hono 라우트를 루트 앱으로 부른다. 요청 모양은 zod 계약(shared/goal/intake.ts)이 막고, 점수 범위, 시각 순서, 컷 조회, 온보딩 상태는 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { intakeResponse } from "../../../shared/goal/intake.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchStudentRow: vi.fn(),
  fetchTargetCuts: vi.fn(),
  getStudentTimeZone: vi.fn(),
  upsertStudentRow: vi.fn(),
  appendProbabilityLog: vi.fn(),
  saveGoalDirectionReport: vi.fn(),
  fetchStudentStateRow: vi.fn(),
  fetchProfileName: vi.fn(),
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

const day = {
  wake: 6,
  sleep: 24,
  hasSchool: true,
  schoolStart: 8.5,
  schoolEnd: 16.5,
  academies: [],
};
const validBody = () => ({
  schoolType: "general",
  grade: "g3",
  upperUniversity: { university: "서울대", department: "경영학과" },
  lowerUniversity: { university: "연세대", department: "경영학과" },
  naesin: { lastExam: "", overall: "", priorNaesinGrade: "3", exams: {} },
  mockExam: { lastRound: "", track: "", rounds: {} },
  studyHours: { mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 4, sun: 4 },
  weekSchedule: {
    mon: day,
    tue: day,
    wed: day,
    thu: day,
    fri: day,
    sat: { ...day, hasSchool: false },
    sun: { ...day, hasSchool: false },
  },
});
const call = (body: unknown) => callGoal("intake", { method: "POST", body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue(null);
  repo.fetchTargetCuts.mockResolvedValue({
    cuts: { idealNaesin: 2, idealJungsi: 90, minNaesin: 3, minJungsi: 80 },
    missing: [],
  });
  repo.getStudentTimeZone.mockResolvedValue("UTC");
  repo.upsertStudentRow.mockImplementation(async (_a, row) => row);
  repo.fetchStudentStateRow.mockResolvedValue(null);
  repo.fetchProfileName.mockResolvedValue("학생");
});
afterEach(() => vi.restoreAllMocks());

describe("요청 형식", () => {
  const withBody = (patch: Record<string, unknown>) => ({
    ...validBody(),
    ...patch,
  });
  test.each([
    ["본문이 비었다", {}],
    ["학교 유형이 목록에 없다", withBody({ schoolType: "x" })],
    ["학년이 목록에 없다", withBody({ grade: "g9" })],
    ["목표 대학이 없다", withBody({ upperUniversity: undefined })],
    ["내신이 객체가 아니다", withBody({ naesin: "x" })],
    ["모의고사가 없다", withBody({ mockExam: undefined })],
    ["자습 시간이 없다", withBody({ studyHours: undefined })],
    ["요일 하나가 빠졌다", withBody({ weekSchedule: { mon: day } })],
    [
      "등교 여부가 boolean 이 아니다",
      withBody({
        weekSchedule: {
          ...validBody().weekSchedule,
          mon: { ...day, hasSchool: 1 },
        },
      }),
    ],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, body) => {
    const r = await call(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.upsertStudentRow).not.toHaveBeenCalled();
  });
});

describe("도메인 규칙은 예전 코드와 문구를 지킨다", () => {
  test("이미 온보딩을 마쳤으면 409 ALREADY_ONBOARDED 다", async () => {
    repo.fetchStudentRow.mockResolvedValue({ onboarded_at: "2026-01-01" });
    const r = await call(validBody());
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "ALREADY_ONBOARDED",
      reason: "already_onboarded",
      detail: "이미 온보딩을 완료했습니다.",
    });
  });

  test("중학교는 501 이고 reason 이 grade_unsupported 다", async () => {
    const r = await call({ ...validBody(), schoolType: "middle" });
    expect(r.status).toBe(501);
    expect(r.body).toMatchObject({
      reason: "grade_unsupported",
      detail: expect.stringContaining("아직 준비 중입니다."),
    });
  });

  test("대학 이름이 비면 400 과 예전 문구다", async () => {
    const r = await call({
      ...validBody(),
      upperUniversity: { university: " ", department: "" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "이상 목표 대학을 선택해 주세요." });
  });

  test("취침이 기상보다 늦지 않으면 400 과 예전 문구다", async () => {
    const body = validBody();
    body.weekSchedule.mon = { ...day, wake: 10, sleep: 9 };
    const r = await call(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "월요일 취침 시각은 기상 시각보다 늦어야 합니다.",
    });
  });

  test("수시 컷이 없으면 422 CUT_NOT_FOUND 와 missing 이다", async () => {
    repo.fetchTargetCuts.mockResolvedValue({
      cuts: {
        idealNaesin: null,
        idealJungsi: null,
        minNaesin: 3,
        minJungsi: 80,
      },
      missing: ["idealNaesin", "idealJungsi"],
    });
    const r = await call(validBody());
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({
      code: "CUT_NOT_FOUND",
      reason: "cut_not_found",
      missing: ["idealNaesin"],
    });
  });
});

describe("동작", () => {
  test("성공하면 student 를 ok 필드 없이 계약으로 준다", async () => {
    const r = await call(validBody());
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    const { student } = intakeResponse.parse(r.body);
    expect(student).toMatchObject({
      onboarded: true,
      profile: { name: "학생", grade: "고3" },
      targets: { ideal: { university: "서울대" } },
    });
    expect(repo.upsertStudentRow).toHaveBeenCalledTimes(1);
    expect(repo.appendProbabilityLog).toHaveBeenCalledTimes(1);
  });
});
