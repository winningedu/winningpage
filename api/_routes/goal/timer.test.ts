// /api/goal/timer: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/timer.ts)이 막고, 이용권과 DB 동작은 repo 함수를 가짜로 바꿔 본다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  TIMER_SUBJECTS,
  timerGetResponse,
  timerRunningResponse,
  timerSubjectsResponse,
  timerTargetResponse,
} from "../../../shared/goal/timer.js";
import { TIMER_SUBJECTS as SERVER_SUBJECTS } from "../../_lib/goal/repo.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  startTimerSession: vi.fn(),
  stopTimerSession: vi.fn(),
  touchTimerHeartbeat: vi.fn(),
  reconcileTimerState: vi.fn(),
  upsertSubjectTarget: vi.fn(),
  addTimerSubject: vi.fn(),
  fetchTimerDaySummary: vi.fn(),
  fetchSubjectTargets: vi.fn(),
  fetchVisibleTimerSubjects: vi.fn(),
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

const post = (body: unknown) => callGoal("timer", { method: "POST", body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
});
afterEach(() => vi.restoreAllMocks());

test("계약의 과목 목록은 서버 TIMER_SUBJECTS 와 같다", () => {
  expect([...TIMER_SUBJECTS]).toEqual(SERVER_SUBJECTS);
});

describe("POST 요청 형식", () => {
  test.each([
    ["본문이 비었다", {}],
    ["모르는 action", { action: "bogus" }],
    ["start 에 과목이 없다", { action: "start" }],
    ["start 의 과목이 목록에 없다", { action: "start", subject: "art" }],
    [
      "setTarget 의 시간이 24 를 넘는다",
      { action: "setTarget", subject: "math", targetHours: 25 },
    ],
    [
      "setTarget 의 시간이 숫자가 아니다",
      { action: "setTarget", subject: "math", targetHours: "x" },
    ],
    ["addSubject 에 과목이 없다", { action: "addSubject" }],
  ])(
    "%s 면 400 VALIDATION_FAILED 와 errors 이고 DB 를 건드리지 않는다",
    async (_n, body) => {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
      expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(
        0,
      );
      expect(repo.startTimerSession).not.toHaveBeenCalled();
      expect(repo.upsertSubjectTarget).not.toHaveBeenCalled();
      expect(repo.addTimerSubject).not.toHaveBeenCalled();
    },
  );
});

describe("POST 동작", () => {
  test("start 는 running 을 주고 계약으로 읽힌다", async () => {
    repo.startTimerSession.mockResolvedValue({
      subject: "math",
      started_at: "2026-11-27T01:00:00Z",
    });
    const r = await post({ action: "start", subject: "math" });
    expect(r.status).toBe(200);
    expect(timerRunningResponse.parse(r.body).running).toEqual({
      subject: "math",
      startedAt: "2026-11-27T01:00:00Z",
    });
  });

  test("stop 은 열린 세션이 없어도 running null 이다", async () => {
    repo.stopTimerSession.mockResolvedValue(null);
    const r = await post({ action: "stop" });
    expect(r.status).toBe(200);
    expect(timerRunningResponse.parse(r.body).running).toBeNull();
  });

  test("heartbeat 는 열린 세션을 돌려준다", async () => {
    repo.touchTimerHeartbeat.mockResolvedValue({
      subject: "korean",
      started_at: "2026-11-27T02:00:00Z",
    });
    const r = await post({ action: "heartbeat" });
    expect(timerRunningResponse.parse(r.body).running?.subject).toBe("korean");
  });

  test("setTarget 은 target 을 준다", async () => {
    repo.upsertSubjectTarget.mockResolvedValue({
      subject: "math",
      targetHours: 2.5,
    });
    const r = await post({
      action: "setTarget",
      subject: "math",
      targetHours: 2.5,
    });
    expect(timerTargetResponse.parse(r.body).target.targetHours).toBe(2.5);
    expect(repo.upsertSubjectTarget).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      "math",
      2.5,
    );
  });

  test("addSubject 는 노출 과목 목록을 준다", async () => {
    repo.addTimerSubject.mockResolvedValue(["math", "etc"]);
    const r = await post({ action: "addSubject", subject: "etc" });
    expect(timerSubjectsResponse.parse(r.body).visibleSubjects).toEqual([
      "math",
      "etc",
    ]);
  });

  test("이용권이 없으면 403 NO_ENTITLEMENT 이다", async () => {
    repo.openGoalSession.mockResolvedValue({
      allowed: false,
      tenantReason: "month_cap",
    });
    const r = await post({ action: "stop" });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      code: "NO_ENTITLEMENT",
      tenantReason: "month_cap",
    });
  });
});

describe("GET", () => {
  test("이용권이 없으면 200 allowed false 이고 계약으로 읽힌다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await callGoal("timer");
    expect(r.status).toBe(200);
    expect(timerGetResponse.parse(r.body)).toEqual({ allowed: false });
  });

  test("요약을 계약으로 읽는다", async () => {
    repo.fetchTimerDaySummary.mockResolvedValue({
      date: "2026-11-27",
      running: null,
      subjects: [{ subject: "math", seconds: 60 }],
      totalSeconds: 60,
    });
    repo.fetchSubjectTargets.mockResolvedValue([
      { subject: "math", targetHours: 2 },
    ]);
    repo.fetchVisibleTimerSubjects.mockResolvedValue(["math"]);
    const r = await callGoal("timer");
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    const parsed = timerGetResponse.parse(r.body);
    expect(parsed).toMatchObject({ date: "2026-11-27", totalSeconds: 60 });
  });
});

test("DELETE 는 405 와 Allow 다", async () => {
  const r = await callGoal("timer", { method: "DELETE" });
  expect(r.status).toBe(405);
  expect(r.headers.allow).toBe("GET, HEAD, POST");
});
