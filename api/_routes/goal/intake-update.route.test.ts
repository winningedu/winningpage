// /api/goal/intake-update: Hono 라우트를 루트 앱으로 부른다. 요청 모양은 zod 계약(shared/goal/intake-update.ts)이 막고, 온보딩 상태, 본인 확인, 컷 조회, 값 규칙은 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchStudentRow: vi.fn(),
  updateStudentRow: vi.fn(),
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

const target = {
  section: "target",
  upperUniversity: { university: "서울대", department: "경영학과" },
  lowerUniversity: { university: "연세대", department: "경영학과" },
};
const call = (body: unknown) =>
  callGoal("intake-update", { method: "POST", body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue({
    onboarded_at: "2026-01-01",
    grade: "고3",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("요청 형식", () => {
  test.each([
    ["본문이 비었다", {}],
    ["구간이 목록에 없다", { section: "weird" }],
    [
      "목표 대학 구간에 하위 대학이 없다",
      { ...target, lowerUniversity: undefined },
    ],
    ["내신 구간에 naesin 이 없다", { section: "naesin" }],
    [
      "모의고사 구간의 mockExam 이 객체가 아니다",
      { section: "mock", mockExam: 3 },
    ],
    ["profileId 가 객체다", { ...target, profileId: {} }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, body) => {
    const r = await call(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.updateStudentRow).not.toHaveBeenCalled();
  });
});

describe("도메인 규칙은 예전 코드와 문구를 지킨다", () => {
  test("다른 학생의 profileId 를 싣으면 403 이다", async () => {
    const r = await call({ ...target, profileId: "other" });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      detail: "본인 정보만 수정할 수 있습니다.",
    });
  });

  test("온보딩 전이면 404 NOT_ONBOARDED 다", async () => {
    repo.fetchStudentRow.mockResolvedValue(null);
    const r = await call(target);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_ONBOARDED",
      reason: "not_onboarded",
      detail: "먼저 온보딩을 완료해 주세요.",
    });
  });

  test("대학 이름이 비면 400 과 예전 문구다", async () => {
    const r = await call({
      ...target,
      upperUniversity: { university: "", department: "" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "이상 목표 대학을 선택해 주세요." });
  });
});
