// /api/goal/workbooks: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/workbooks.ts)이 막고, 페이지 규칙과 소유자 규칙은 핸들러가 지킨다.
// 현재 페이지는 전체 페이지를 넘을 수 없고 전체 페이지는 등록 후 수정할 수 없다(사용자 확정 2026-09-02).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  workbookDeleteResponse,
  workbookResponse,
  workbooksListResponse,
} from "../../../shared/goal/workbooks.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchWorkbooks: vi.fn(),
  insertWorkbook: vi.fn(),
  fetchWorkbookOwned: vi.fn(),
  updateWorkbookOwned: vi.fn(),
  deleteWorkbookOwned: vi.fn(),
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
  id: 3,
  subject: "math",
  title: "수능특강",
  total_pages: 200,
  current_page: 120,
  status: "reading",
  shelved_at: null,
};
const call = (method: string, body?: unknown) =>
  callGoal("workbooks", { method, body });
const create = { subject: "math", title: "수능특강", totalPages: 200 };

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

describe("요청 형식", () => {
  test.each([
    ["과목이 목록에 없다", "POST", { ...create, subject: "social" }],
    ["이름이 비었다", "POST", { ...create, title: " " }],
    ["이름이 100자를 넘는다", "POST", { ...create, title: "가".repeat(101) }],
    ["전체 페이지가 0 이다", "POST", { ...create, totalPages: 0 }],
    ["전체 페이지가 상한을 넘는다", "POST", { ...create, totalPages: 100001 }],
    ["전체 페이지가 숫자가 아니다", "POST", { ...create, totalPages: "x" }],
    ["현재 페이지가 음수다", "POST", { ...create, currentPage: -1 }],
    ["PUT 에 id 가 없다", "PUT", { title: "새 이름" }],
    ["PUT 의 현재 페이지가 음수다", "PUT", { id: 3, currentPage: -2 }],
    ["DELETE 에 id 가 없다", "DELETE", {}],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, method, body) => {
    const r = await call(method, body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.insertWorkbook).not.toHaveBeenCalled();
    expect(repo.updateWorkbookOwned).not.toHaveBeenCalled();
    expect(repo.deleteWorkbookOwned).not.toHaveBeenCalled();
  });
});

describe("등록", () => {
  test("현재 페이지가 전체 페이지를 넘으면 400 이고 문구는 그대로다", async () => {
    const r = await call("POST", { ...create, currentPage: 201 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "현재 페이지는 전체 페이지를 넘을 수 없습니다.",
    });
    expect(repo.insertWorkbook).not.toHaveBeenCalled();
  });

  test("현재 페이지가 전체 페이지와 같으면 완독으로 저장한다", async () => {
    repo.insertWorkbook.mockResolvedValue({ ...row, status: "done" });
    const r = await call("POST", { ...create, currentPage: 200 });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(workbookResponse.parse(r.body).workbook.id).toBe(3);
    expect(repo.insertWorkbook).toHaveBeenCalledWith(expect.anything(), {
      profile_id: "p1",
      subject: "math",
      title: "수능특강",
      total_pages: 200,
      current_page: 200,
      status: "done",
    });
  });

  test("현재 페이지가 없으면 0 으로 저장한다", async () => {
    repo.insertWorkbook.mockResolvedValue(row);
    await call("POST", create);
    expect(repo.insertWorkbook.mock.calls[0]?.[1]).toMatchObject({
      current_page: 0,
      status: "reading",
    });
  });

  test("이용권이 없으면 403 NO_ENTITLEMENT 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("POST", create);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });
});

describe("조회", () => {
  test("GET 은 목록을 ok 필드 없이 계약으로 준다", async () => {
    repo.fetchWorkbooks.mockResolvedValue([row]);
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/json");
    expect(r.body).not.toHaveProperty("ok");
    expect(workbooksListResponse.parse(r.body)).toMatchObject({
      workbooks: [{ id: 3, shelvedAt: null }],
    });
  });

  test("GET 이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("GET");
    expect(workbooksListResponse.parse(r.body)).toEqual({ allowed: false });
  });
});

describe("수정", () => {
  test("전체 페이지를 보내면 400 이고 문구는 그대로다", async () => {
    const r = await call("PUT", { id: 3, totalPages: 300 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "전체 페이지는 등록 후 수정할 수 없습니다.",
    });
  });

  test("바꿀 값이 없으면 400 이다", async () => {
    const r = await call("PUT", { id: 3 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "변경할 값이 없습니다." });
  });

  test("현재 페이지만 보내면 기존 값을 되먹여 완전한 행을 쓴다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue(row);
    repo.updateWorkbookOwned.mockResolvedValue({ ...row, current_page: 130 });
    const r = await call("PUT", { id: 3, currentPage: 130 });
    expect(r.status).toBe(200);
    expect(workbookResponse.parse(r.body).workbook.currentPage).toBe(130);
    expect(repo.updateWorkbookOwned).toHaveBeenCalledWith(
      expect.anything(),
      3,
      "p1",
      {
        title: "수능특강",
        total_pages: 200,
        current_page: 130,
        status: "reading",
      },
    );
  });

  test("현재 페이지가 기존 전체 페이지를 넘으면 400 이다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue(row);
    const r = await call("PUT", { id: 3, currentPage: 201 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "현재 페이지는 전체 페이지를 넘을 수 없습니다.",
    });
  });

  test("남의 문제집이면 404 다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue(null);
    const r = await call("PUT", { id: 9, currentPage: 1 });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ detail: "문제집을 찾을 수 없습니다." });
  });
});

describe("책장에 꽂기", () => {
  test("완독하지 않았으면 400 이고 문구는 그대로다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue(row);
    const r = await call("PUT", { id: 3, shelve: true });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "아직 완독하지 않은 문제집은 책장에 꽂을 수 없습니다.",
    });
  });

  test("완독했으면 shelved_at 을 넣는다", async () => {
    repo.fetchWorkbookOwned.mockResolvedValue({ ...row, status: "done" });
    repo.updateWorkbookOwned.mockResolvedValue({
      ...row,
      status: "done",
      shelved_at: "2026-11-27T00:00:00Z",
    });
    const r = await call("PUT", { id: 3, shelve: true });
    expect(workbookResponse.parse(r.body).workbook.shelvedAt).toBe(
      "2026-11-27T00:00:00Z",
    );
  });
});

describe("삭제", () => {
  test("DELETE 는 빈 객체를 주고, 없으면 404 다", async () => {
    repo.deleteWorkbookOwned.mockResolvedValueOnce(true);
    const ok = await call("DELETE", { id: 3 });
    expect(ok.status).toBe(200);
    expect(workbookDeleteResponse.parse(ok.body)).toEqual({});
    repo.deleteWorkbookOwned.mockResolvedValueOnce(false);
    expect((await call("DELETE", { id: 4 })).status).toBe(404);
  });
});
