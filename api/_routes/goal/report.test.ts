// api/_routes/goal/report.ts 순수 함수 검증 — advice.test.ts와 동일 방침: DB I/O가 있는 핸들러
// 전체(openGoalSession/checkLinkedPair/buildGrowthReport 등)는 여기서 돌리지 않고,
// 분리 가능한 순수 함수(parseStudentIdParam)만 검증한다. studentId 분기의 실제 인증·
// 권한 게이트(본인 조회 200 / 연결된 자녀 200 / 미연결 403 NOT_LINKED)는 로컬 스택
// QA로 확인한다(다른 goal 라우트도 같은 컨벤션 — 핸들러 단위 테스트 파일이 없다).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../_lib/httpAuth.js", () => ({
  resolveUser: async () => ({ userId: "u1", user: { id: "u1" }, token: "t" }),
}));
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({}),
}));

const repo = vi.hoisted(() => ({
  student: {} as Record<string, unknown>,
  timeZone: "Asia/Seoul",
}));

vi.mock("../../_lib/goal/repo.js", () => ({
  openGoalSession: async () => ({
    supabaseAdmin: {},
    profileId: "student-1",
    allowed: true,
  }),
  narrowGoalSession: (s: { supabaseAdmin: unknown; profileId: string }) => s,
  fetchStudentRow: async () => repo.student,
  getStudentTimeZone: async () => repo.timeZone,
  fetchRecordsInRange: async () => [],
  fetchTimerSessionsInRange: async () => [],
  fetchPlanTasksInRange: async () => [],
  fetchActiveCohortProfileIds: async () => [],
  fetchMentorComment: async () => null,
  fetchDailyRecordsForProfilesInRange: async () => [],
  fetchProbabilityLogAtOrBefore: async () => null,
  fetchEarliestProbabilityLog: async () => null,
}));

import { callGoal } from "../../_lib/goal/route.testkit.js";
import { parseStudentIdParam, snapshotBounds } from "./report.js";

async function getReport(query: Record<string, string>) {
  const { status, body } = await callGoal("report", { query });
  return {
    status,
    report: (body as Record<string, unknown>).report as Record<string, unknown>,
  };
}

describe("성장 리포트 기간 선택 목록", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T03:00:00Z"));
    repo.timeZone = "Asia/Seoul";
    repo.student = {
      onboarded_at: "2026-10-01T00:00:00Z",
      status: "active",
      actual_start_date: "2026-11-04",
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("주간 응답에 periodOptions와 activePeriod가 실린다", async () => {
    const { status, report } = await getReport({ type: "weekly" });
    expect(status).toBe(200);
    expect(report.activePeriod).toBe("2026-11-23");
    expect(report.periodOptions).toEqual([
      { value: "2026-11-23", label: "이번 주 11.23 ~ 11.29" },
      { value: "2026-11-16", label: "11.16 ~ 11.22" },
      { value: "2026-11-09", label: "11.9 ~ 11.15" },
      { value: "2026-11-02", label: "11.2 ~ 11.8" },
    ]);
  });

  test("월간 응답에 periodOptions와 activePeriod가 실린다", async () => {
    const { report } = await getReport({ type: "monthly" });
    expect(report.activePeriod).toBe("2026-11");
    expect(report.periodOptions).toEqual([
      { value: "2026-11", label: "이번 달 2026년 11월" },
    ]);
  });

  test("지난 주 period를 주면 그 주가 activePeriod다", async () => {
    const { report } = await getReport({
      type: "weekly",
      period: "2026-11-11",
    });
    expect(report.activePeriod).toBe("2026-11-09");
    expect(report.periodLabel).toBe("2026-11-09 ~ 2026-11-15");
  });

  test("actual_start_date가 없으면 onboarded_at을 학생 시간대 날짜로 바꿔 시작일로 쓴다", async () => {
    repo.student = {
      onboarded_at: "2026-11-08T16:00:00Z",
      status: "active",
      actual_start_date: null,
    };
    // 서울 기준 11-09(월)이므로 첫 항목은 11.9 주다. UTC 날짜였다면 11-08 이라 11.2 주가 나온다.
    const { report } = await getReport({ type: "weekly" });
    const options = report.periodOptions as { value: string }[];
    expect(options.map((o) => o.value)).toEqual([
      "2026-11-23",
      "2026-11-16",
      "2026-11-09",
    ]);
  });
});

describe("parseStudentIdParam — 학부모 자녀 리포트 열람용 studentId 쿼리 파싱", () => {
  test("문자열 값이면 그대로 돌려준다", () => {
    expect(parseStudentIdParam({ studentId: "abc-123" })).toBe("abc-123");
  });

  test("studentId가 없으면(본인 조회 경로) undefined", () => {
    expect(parseStudentIdParam({})).toBeUndefined();
    expect(parseStudentIdParam(undefined)).toBeUndefined();
  });

  test("빈 문자열은 없음으로 접는다", () => {
    expect(parseStudentIdParam({ studentId: "" })).toBeUndefined();
  });

  test("중복 쿼리 키로 배열이 오면 방어적으로 무시한다", () => {
    expect(parseStudentIdParam({ studentId: ["a", "b"] })).toBeUndefined();
  });
});

describe("snapshotBounds, 리포트 확률 스냅샷 경계", () => {
  test("서울 학생은 [현지 시작, 다음 현지 시작) 이다", () => {
    expect(
      snapshotBounds({ start: "2026-11-16", end: "2026-11-22" }, "Asia/Seoul"),
    ).toEqual({
      startIso: "2026-11-15T15:00:00.000Z",
      endExclusiveIso: "2026-11-22T15:00:00.000Z",
    });
  });

  test("LA 학생은 같은 기간이 8시간 대 뒤로 밀린다", () => {
    expect(
      snapshotBounds(
        { start: "2026-11-16", end: "2026-11-22" },
        "America/Los_Angeles",
      ),
    ).toEqual({
      startIso: "2026-11-16T08:00:00.000Z",
      endExclusiveIso: "2026-11-23T08:00:00.000Z",
    });
  });
});
