// /api/goal/plan-tasks: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/plan-tasks.ts)이 막고, 기간 한도와 문제집 소유 확인은 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  PLAN_TASK_SUBJECT_LABELS,
  planTaskDeleteResponse,
  planTaskResponse,
  planTasksListResponse,
} from "../../../shared/goal/plan-tasks.js";
import { SUBJECT_LABEL_TO_CODE } from "../../_lib/goal/repo.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchPlanTasks: vi.fn(),
  insertPlanTask: vi.fn(),
  updatePlanTask: vi.fn(),
  deletePlanTask: vi.fn(),
  fetchWorkbookOwned: vi.fn(),
  updateWorkbookOwned: vi.fn(),
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
  id: 5,
  plan_date: "2026-11-27",
  title: "문제 풀이",
  subject: "math",
  duration_minutes: 30,
  status: "pending",
  sort_order: 0,
  workbook_id: null,
  page_from: null,
  page_to: null,
};
const create = {
  planDate: "2026-11-27",
  title: " 문제 풀이 ",
  subject: "수학",
  durationMinutes: 30,
};
const call = (
  method: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
) => callGoal("plan-tasks", { method, ...opts });

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

test("계약의 과목 라벨은 서버 SUBJECT_LABEL_TO_CODE 의 키와 같다", () => {
  expect([...PLAN_TASK_SUBJECT_LABELS].sort()).toEqual(
    Object.keys(SUBJECT_LABEL_TO_CODE).sort(),
  );
});

describe("요청 형식", () => {
  test.each([
    ["GET 에 from 이 없다", "GET", { query: { to: "2026-11-30" } }],
    [
      "GET 의 날짜 형식이 다르다",
      "GET",
      { query: { from: "11/27", to: "2026-11-30" } },
    ],
    [
      "GET 의 날짜가 없는 날이다",
      "GET",
      { query: { from: "2026-02-30", to: "2026-03-01" } },
    ],
    ["날짜 형식이 다르다", "POST", { body: { ...create, planDate: "x" } }],
    ["내용이 비었다", "POST", { body: { ...create, title: " " } }],
    [
      "내용이 100자를 넘는다",
      "POST",
      { body: { ...create, title: "가".repeat(101) } },
    ],
    ["과목이 라벨에 없다", "POST", { body: { ...create, subject: "math" } }],
    [
      "소요 시간이 1440 을 넘는다",
      "POST",
      { body: { ...create, durationMinutes: 1441 } },
    ],
    [
      "workbookId 가 정수가 아니다",
      "POST",
      { body: { ...create, workbookId: "abc" } },
    ],
    [
      "페이지가 1 미만이다",
      "POST",
      { body: { ...create, workbookId: 7, pageFrom: 0, pageTo: 10 } },
    ],
    ["PUT 에 id 가 없다", "PUT", { body: { title: "x" } }],
    ["PUT 의 status 가 3종이 아니다", "PUT", { body: { id: 5, status: "x" } }],
    ["DELETE 에 id 가 없다", "DELETE", { body: {} }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, method, opts) => {
    const r = await call(method, opts);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.fetchPlanTasks).not.toHaveBeenCalled();
    expect(repo.insertPlanTask).not.toHaveBeenCalled();
    expect(repo.updatePlanTask).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  test("기간 과제를 ok 필드 없이 계약으로 준다", async () => {
    repo.fetchPlanTasks.mockResolvedValue([row]);
    const r = await call("GET", {
      query: { from: "2026-11-27", to: "2026-11-30" },
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).not.toHaveProperty("ok");
    expect(planTasksListResponse.parse(r.body)).toMatchObject({
      tasks: [{ id: 5, subject: "수학", status: "pending", done: false }],
    });
  });

  test("from 이 to 보다 늦으면 400 이고 문구는 그대로다", async () => {
    const r = await call("GET", {
      query: { from: "2026-12-01", to: "2026-11-30" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "from은 to보다 이전이어야 합니다.",
    });
  });

  test("기간이 62일을 넘으면 400 이고 문구는 그대로다", async () => {
    const r = await call("GET", {
      query: { from: "2026-01-01", to: "2026-04-01" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "조회 기간은 최대 62일까지 가능합니다.",
    });
  });

  test("이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("GET", {
      query: { from: "2026-11-27", to: "2026-11-30" },
    });
    expect(planTasksListResponse.parse(r.body)).toEqual({ allowed: false });
  });
});

describe("POST", () => {
  test("라벨을 DB 코드로 바꿔 저장하고 task 를 준다", async () => {
    repo.insertPlanTask.mockResolvedValue(row);
    const r = await call("POST", { body: create });
    expect(r.status).toBe(200);
    expect(planTaskResponse.parse(r.body).task.id).toBe(5);
    expect(repo.insertPlanTask).toHaveBeenCalledWith(expect.anything(), {
      profile_id: "p1",
      plan_date: "2026-11-27",
      title: "문제 풀이",
      subject: "math",
      duration_minutes: 30,
    });
  });

  test("소요 시간이 없으면 0 분이다", async () => {
    repo.insertPlanTask.mockResolvedValue(row);
    await call("POST", { body: { ...create, durationMinutes: undefined } });
    expect(repo.insertPlanTask.mock.calls[0]?.[1].duration_minutes).toBe(0);
  });

  test("문제집 연결 과제를 여러 날짜로 펼치면 400 이고 문구는 그대로다", async () => {
    const r = await call("POST", {
      body: { ...create, workbookId: 7, repeatSchedule: true },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "문제집 연결 과제는 선택한 날짜 하루에만 추가할 수 있습니다.",
    });
  });

  test("남의 문제집이면 400 이고 문구는 그대로다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue(null);
    const r = await call("POST", { body: { ...create, workbookId: 7 } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "문제집을 찾을 수 없습니다." });
  });

  test("이용권이 없으면 403 NO_ENTITLEMENT 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("POST", { body: create });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });
});

describe("PUT, DELETE", () => {
  test("수정할 필드가 없으면 400 이고 문구는 그대로다", async () => {
    const r = await call("PUT", { body: { id: 5 } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "수정할 필드가 없습니다." });
  });

  test("status 를 보내면 done 도 함께 갱신한다", async () => {
    repo.updatePlanTask.mockResolvedValue({ ...row, status: "done" });
    const r = await call("PUT", { body: { id: 5, status: "done" } });
    expect(planTaskResponse.parse(r.body).task.done).toBe(true);
    expect(repo.updatePlanTask).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      5,
      { status: "done", done: true },
    );
  });

  test("없는 과제면 404 다", async () => {
    repo.updatePlanTask.mockResolvedValue(null);
    const r = await call("PUT", { body: { id: 9, title: "x" } });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ detail: "과제를 찾을 수 없습니다." });
  });

  test("DELETE 는 빈 객체를 주고, 없으면 404 다", async () => {
    repo.deletePlanTask.mockResolvedValueOnce(true);
    const ok = await call("DELETE", { body: { id: 5 } });
    expect(planTaskDeleteResponse.parse(ok.body)).toEqual({});
    repo.deletePlanTask.mockResolvedValueOnce(false);
    expect((await call("DELETE", { body: { id: 6 } })).status).toBe(404);
  });
});
