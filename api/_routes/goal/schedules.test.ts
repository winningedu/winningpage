// /api/goal/schedules: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/schedules.ts)이 막고, 도메인 규칙(온보딩, 소유자)은 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  scheduleDeleteResponse,
  scheduleResponse,
  schedulesListResponse,
} from "../../../shared/goal/schedules.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchStudentRow: vi.fn(),
  fetchSchedules: vi.fn(),
  insertSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
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

const row = {
  id: 7,
  title: "수행평가",
  category: "exam",
  due_date: "2026-12-01",
  memo: "",
};
const valid = {
  title: " 수행평가 ",
  category: "exam",
  dueDate: "2026-12-01",
  memo: "m",
};
const call = (method: string, body?: unknown) =>
  callGoal("schedules", { method, body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue({ onboarded_at: "2026-01-01" });
});
afterEach(() => vi.restoreAllMocks());

describe("요청 형식", () => {
  test.each([
    ["제목이 비었다", "POST", { ...valid, title: "  " }],
    ["제목이 100자를 넘는다", "POST", { ...valid, title: "가".repeat(101) }],
    ["종류가 목록에 없다", "POST", { ...valid, category: "x" }],
    ["마감일 형식이 다르다", "POST", { ...valid, dueDate: "2026/12/01" }],
    ["없는 날짜다", "POST", { ...valid, dueDate: "2026-13-45" }],
    ["메모가 문자열이 아니다", "POST", { ...valid, memo: 3 }],
    ["본문이 비었다", "POST", {}],
    ["PUT 에 id 가 없다", "PUT", valid],
    ["PUT 의 id 가 0 이다", "PUT", { ...valid, id: 0 }],
    ["DELETE 에 id 가 없다", "DELETE", {}],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, method, body) => {
    const r = await call(method, body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.insertSchedule).not.toHaveBeenCalled();
    expect(repo.updateSchedule).not.toHaveBeenCalled();
    expect(repo.deleteSchedule).not.toHaveBeenCalled();
  });
});

describe("동작", () => {
  test("GET 은 목록을 ok 필드 없이 계약으로 준다", async () => {
    repo.fetchSchedules.mockResolvedValue([row]);
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).not.toHaveProperty("ok");
    expect(schedulesListResponse.parse(r.body)).toMatchObject({
      schedules: [{ id: 7, dueDate: "2026-12-01" }],
    });
  });

  test("GET 이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("GET");
    expect(schedulesListResponse.parse(r.body)).toEqual({ allowed: false });
  });

  test("POST 는 제목을 다듬어 저장하고 schedule 을 준다", async () => {
    repo.insertSchedule.mockResolvedValue(row);
    const r = await call("POST", valid);
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(scheduleResponse.parse(r.body).schedule.id).toBe(7);
    expect(repo.insertSchedule).toHaveBeenCalledWith(expect.anything(), {
      profile_id: "p1",
      title: "수행평가",
      category: "exam",
      due_date: "2026-12-01",
      memo: "m",
    });
  });

  test("POST 메모는 1000자로 자르고 없으면 빈 문자열이다", async () => {
    repo.insertSchedule.mockResolvedValue(row);
    await call("POST", { ...valid, memo: "a".repeat(1500) });
    expect(repo.insertSchedule.mock.calls[0]?.[1].memo).toHaveLength(1000);
    await call("POST", { ...valid, memo: undefined });
    expect(repo.insertSchedule.mock.calls[1]?.[1].memo).toBe("");
  });

  test("POST 온보딩 전이면 409 NOT_ONBOARDED 다", async () => {
    repo.fetchStudentRow.mockResolvedValue(null);
    const r = await call("POST", valid);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "NOT_ONBOARDED" });
  });

  test("POST 이용권이 없으면 403 NO_ENTITLEMENT 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("POST", valid);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });

  test("PUT 은 없는 일정이면 404 다", async () => {
    repo.updateSchedule.mockResolvedValue(null);
    const r = await call("PUT", { ...valid, id: 9 });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ detail: "일정을 찾을 수 없습니다." });
  });

  test("PUT 은 소유자 스코프로 갱신하고 schedule 을 준다", async () => {
    repo.updateSchedule.mockResolvedValue(row);
    const r = await call("PUT", { ...valid, id: 7 });
    expect(scheduleResponse.parse(r.body).schedule.id).toBe(7);
    expect(repo.updateSchedule).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      7,
      expect.objectContaining({ title: "수행평가" }),
    );
  });

  test("DELETE 는 빈 객체를 주고, 없는 일정이면 404 다", async () => {
    repo.deleteSchedule.mockResolvedValueOnce(true);
    const ok = await call("DELETE", { id: 7 });
    expect(ok.status).toBe(200);
    expect(scheduleDeleteResponse.parse(ok.body)).toEqual({});
    repo.deleteSchedule.mockResolvedValueOnce(false);
    const gone = await call("DELETE", { id: 8 });
    expect(gone.status).toBe(404);
  });

  test("PATCH 는 405 와 Allow 다", async () => {
    const r = await call("PATCH");
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("DELETE, GET, HEAD, POST, PUT");
  });
});
