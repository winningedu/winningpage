// /api/goal/grades: Hono 라우트를 루트 앱으로 부른다. 요청 형식은 zod 계약(shared/goal/grades.ts)이 막고, 점수 범위와 회차 이름 규칙, 온보딩 상태는 핸들러가 지킨다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  gradeDeleteResponse,
  gradesListResponse,
  gradeWriteResponse,
} from "../../../shared/goal/grades.js";

const repo = vi.hoisted(() => ({
  openGoalSession: vi.fn(),
  fetchStudentRow: vi.fn(),
  updateStudentGrades: vi.fn(),
  saveGoalDirectionReport: vi.fn(),
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

const naesinEntry = {
  term: "고2 1학기 중간",
  enteredAt: "2026-05-01",
  subjects: {
    korean: 2,
    math: 3,
    english: 1,
    social_history: 2,
    science: 2,
    second_language: 2,
  },
};
const saved = {
  term: "고1 2학기",
  enteredAt: "2025-12-01",
  subjects: { korean: 2 },
  value: 2,
  none: false,
  recordedAt: "2025-12-02T00:00:00.000Z",
};
const call = (method: string, body?: unknown) =>
  callGoal("grades", { method, body });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.openGoalSession.mockResolvedValue({
    allowed: true,
    supabaseAdmin: {},
    profileId: "p1",
  });
  repo.fetchStudentRow.mockResolvedValue({
    grade: "고2",
    naesin_scores: { records: [saved] },
    mock_exam_scores: {},
  });
});
afterEach(() => vi.restoreAllMocks());

describe("요청 형식", () => {
  test.each([
    ["POST 유형이 목록에 없다", "POST", { type: "x", entry: naesinEntry }],
    ["POST 에 entry 가 없다", "POST", { type: "naesin" }],
    [
      "POST subjects 가 객체가 아니다",
      "POST",
      { type: "naesin", entry: { ...naesinEntry, subjects: 3 } },
    ],
    [
      "POST 회차가 문자열이 아니다",
      "POST",
      { type: "naesin", entry: { ...naesinEntry, term: 3 } },
    ],
    ["PUT 에 term 이 없다", "PUT", { type: "naesin", entry: naesinEntry }],
    ["DELETE 에 type 이 없다", "DELETE", { term: "a" }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, method, body) => {
    const r = await call(method, body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(repo.updateStudentGrades).not.toHaveBeenCalled();
  });
});

describe("도메인 규칙은 예전 코드와 문구를 지킨다", () => {
  test("내신 점수가 1~9 를 벗어나면 400 과 예전 문구다", async () => {
    const r = await call("POST", {
      type: "naesin",
      entry: {
        ...naesinEntry,
        subjects: { ...naesinEntry.subjects, math: 10 },
      },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      detail: "과목별 점수는 1~9 등급 사이여야 합니다.",
    });
  });

  test("예약된 회차 이름은 400 이다", async () => {
    const r = await call("POST", {
      type: "naesin",
      entry: { ...naesinEntry, term: "s1mid" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "사용할 수 없는 회차 이름입니다." });
  });

  test("온보딩 전이면 404 NOT_ONBOARDED 와 reason 이다", async () => {
    repo.fetchStudentRow.mockResolvedValue(null);
    const r = await call("POST", { type: "naesin", entry: naesinEntry });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_ONBOARDED",
      reason: "not_onboarded",
      detail: "온보딩을 먼저 완료해 주세요.",
    });
  });

  test("PUT 에서 없는 회차는 404 RECORD_NOT_FOUND 다", async () => {
    const r = await call("PUT", {
      type: "naesin",
      term: "없는 회차",
      entry: naesinEntry,
    });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "RECORD_NOT_FOUND",
      reason: "record_not_found",
    });
  });

  test("PUT 에서 다른 회차 이름과 겹치면 400 이다", async () => {
    repo.fetchStudentRow.mockResolvedValue({
      naesin_scores: { records: [saved, { ...saved, term: naesinEntry.term }] },
    });
    const r = await call("PUT", {
      type: "naesin",
      term: saved.term,
      entry: naesinEntry,
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "이미 사용 중인 회차 이름입니다." });
  });

  test("DELETE 에서 없는 회차는 404 RECORD_NOT_FOUND 다", async () => {
    const r = await call("DELETE", { type: "naesin", term: "없음" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "RECORD_NOT_FOUND" });
  });
});

describe("동작", () => {
  test("GET 은 회차 목록을 계약으로 준다", async () => {
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(gradesListResponse.parse(r.body)).toMatchObject({
      onboarded: true,
      naesinRecords: [{ term: "고1 2학기" }],
      mockRecords: [],
    });
  });

  test("GET 온보딩 전이면 onboarded false 다", async () => {
    repo.fetchStudentRow.mockResolvedValue(null);
    const r = await call("GET");
    expect(gradesListResponse.parse(r.body)).toEqual({ onboarded: false });
  });

  test("GET 이용권이 없으면 200 allowed false 다", async () => {
    repo.openGoalSession.mockResolvedValue({ allowed: false });
    const r = await call("GET");
    expect(gradesListResponse.parse(r.body)).toEqual({ allowed: false });
  });

  test("POST 는 회차를 저장하고 record 와 records 를 준다", async () => {
    const r = await call("POST", { type: "naesin", entry: naesinEntry });
    expect(r.status).toBe(200);
    const parsed = gradeWriteResponse.parse(r.body);
    expect(parsed.record.term).toBe(naesinEntry.term);
    expect(parsed.records).toHaveLength(2);
    expect(repo.updateStudentGrades).toHaveBeenCalledTimes(1);
    expect(repo.saveGoalDirectionReport).toHaveBeenCalledTimes(1);
  });

  test("PUT 은 회차를 바꾸고 records 를 준다", async () => {
    const r = await call("PUT", {
      type: "naesin",
      term: saved.term,
      entry: naesinEntry,
    });
    expect(r.status).toBe(200);
    expect(gradeWriteResponse.parse(r.body).record.term).toBe(naesinEntry.term);
  });

  test("DELETE 는 남은 records 를 준다", async () => {
    const r = await call("DELETE", { type: "naesin", term: saved.term });
    expect(r.status).toBe(200);
    expect(gradeDeleteResponse.parse(r.body)).toEqual({ records: [] });
  });
});
