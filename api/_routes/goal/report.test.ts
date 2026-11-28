// api/_routes/goal/report.ts 순수 함수 검증 — advice.test.ts와 동일 방침: DB I/O가 있는 핸들러
// 전체(openGoalSession/checkLinkedPair/buildGrowthReport 등)는 여기서 돌리지 않고,
// 분리 가능한 순수 함수(snapshotBounds)와 요청 형식, 응답 계약을 검증한다. studentId 분기의 실제 인증·
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
  linked: true,
  // 읽기가 함께 시작하는지 보려고 어떤 읽기를 풀기 전까지 붙잡아 둔다.
  studentHold: null as Promise<void> | null,
  recordsHold: null as Promise<void> | null,
  cohortRecordsHold: null as Promise<void> | null,
  timeZoneCalls: 0,
  logCalls: 0,
  earliestCalls: 0,
}));

vi.mock("../../_lib/goal/repo.js", () => ({
  openGoalSession: async () => ({
    supabaseAdmin: {},
    profileId: "student-1",
    allowed: true,
  }),
  narrowGoalSession: (s: { supabaseAdmin: unknown; profileId: string }) => s,
  fetchStudentRow: async () => {
    await repo.studentHold;
    return repo.student;
  },
  checkLinkedPair: async () => repo.linked,
  hasGoalAccessFor: async () => true,
  getStudentTimeZone: async () => {
    repo.timeZoneCalls += 1;
    return repo.timeZone;
  },
  fetchRecordsInRange: async () => {
    await repo.recordsHold;
    return [];
  },
  fetchTimerSessionsInRange: async () => [],
  fetchPlanTasksInRange: async () => [],
  fetchActiveCohortProfileIds: async () => [],
  fetchMentorComment: async () => null,
  fetchDailyRecordsForProfilesInRange: async () => {
    await repo.cohortRecordsHold;
    return [];
  },
  fetchProbabilityLogAtOrBefore: async () => {
    repo.logCalls += 1;
    return null;
  },
  fetchEarliestProbabilityLog: async () => {
    repo.earliestCalls += 1;
    return null;
  },
}));

import { reportResponse } from "../../../shared/goal/report.js";
import { callGoal } from "../../_lib/goal/route.testkit.js";
import { snapshotBounds } from "./report.js";

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

describe("리포트 요청 형식과 응답", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.linked = true;
    repo.timeZone = "Asia/Seoul";
    repo.student = {
      onboarded_at: "2026-10-01T00:00:00Z",
      status: "active",
      actual_start_date: "2026-11-04",
    };
  });

  test.each([
    ["type 이 없다", {}],
    ["type 이 목록에 없다", { type: "yearly" }],
    ["track 이 목록에 없다", { type: "direction", track: "x" }],
    ["studentId 가 uuid 가 아니다", { type: "weekly", studentId: "abc-123" }],
    ["studentId 가 비었다", { type: "weekly", studentId: "" }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, query) => {
    const r = await callGoal("report", { query });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
  });

  test("direction 에 studentId 를 함께 보내면 400 이고 문구는 그대로다", async () => {
    const r = await callGoal("report", {
      query: {
        type: "direction",
        studentId: "123e4567-e89b-12d3-a456-426614174000",
      },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "studentId는 weekly|monthly 조회에서만 사용할 수 있습니다.",
    });
  });

  test("연결되지 않은 자녀면 403 NOT_LINKED 다", async () => {
    repo.linked = false;
    const r = await callGoal("report", {
      query: {
        type: "weekly",
        studentId: "123e4567-e89b-12d3-a456-426614174000",
      },
    });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "NOT_LINKED" });
  });

  test("주간 리포트를 계약으로 읽고 ok 필드가 없다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T03:00:00Z"));
    const r = await callGoal("report", { query: { type: "weekly" } });
    vi.useRealTimers();
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(reportResponse.parse(r.body)).toMatchObject({
      report: { activePeriod: "2026-11-23" },
    });
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

describe("리포트 읽기", () => {
  const hold = () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { gate, release };
  };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.linked = true;
    repo.timeZone = "Asia/Seoul";
    repo.studentHold = null;
    repo.recordsHold = null;
    repo.cohortRecordsHold = null;
    repo.timeZoneCalls = 0;
    repo.logCalls = 0;
    repo.earliestCalls = 0;
    repo.student = {
      onboarded_at: "2026-10-01T00:00:00Z",
      status: "active",
      actual_start_date: "2026-11-04",
    };
  });

  test("학생 확인과 시간대 읽기를 함께 시작한다", async () => {
    const { gate, release } = hold();
    repo.studentHold = gate;

    const request = getReport({ type: "weekly" });
    await vi.waitFor(() => expect(repo.timeZoneCalls).toBe(1));
    release();

    expect((await request).status).toBe(200);
  });

  test("온보딩 전이면 409 not_onboarded 다", async () => {
    repo.student = { onboarded_at: null };

    const { status } = await getReport({ type: "weekly" });

    expect(status).toBe(409);
  });

  test("합격 가능성 스냅샷 읽기를 기록 읽기와 함께 시작한다", async () => {
    const { gate, release } = hold();
    repo.recordsHold = gate;

    const request = getReport({ type: "weekly" });
    await vi.waitFor(() => expect(repo.logCalls).toBe(2));
    release();

    expect((await request).status).toBe(200);
  });

  test("기간 이전 스냅샷이 없으면 처음 스냅샷 읽기를 코호트 기록 읽기와 함께 시작한다", async () => {
    const { gate, release } = hold();
    repo.cohortRecordsHold = gate;

    const request = getReport({ type: "weekly" });
    await vi.waitFor(() => expect(repo.earliestCalls).toBe(1));
    release();

    expect((await request).status).toBe(200);
  });
});
