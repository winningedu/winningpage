// POST /api/selfeval/analyze: Hono 라우트를 루트 앱으로 부른다.
// 세션 읽기(db.js)와 단계 실행(steps/analyze.js)은 가짜로 바꾸고, 규칙은 steps/analyze.test.ts 가 본다.
// 응답은 계약 스키마(shared/selfeval/analyze.ts)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  analyzeEditResponse,
  analyzeRunResponse,
} from "../../../shared/selfeval/analyze.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  loadSession: vi.fn(),
  runAnalyze: vi.fn(),
  saveAnalysis: vi.fn(),
  resolveAnalysisConflict: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: kit.loadSession,
}));

vi.mock("../../_lib/selfeval/steps/analyze.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/steps/analyze.js")
  >()),
  runAnalyze: kit.runAnalyze,
  saveAnalysis: kit.saveAnalysis,
  resolveAnalysisConflict: kit.resolveAnalysisConflict,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/analyze" };
const ID = "123e4567-e89b-12d3-a456-426614174000";
const FIELDS = [
  "motive",
  "concept",
  "action",
  "method",
  "result",
  "role",
  "collaboration",
  "learning",
  "career",
  "limitation",
  "next",
] as const;
const analysis = {
  values: Object.fromEntries(FIELDS.map((k) => [k, "값"])),
  sources: Object.fromEntries(FIELDS.map((k) => [k, "record"])),
  conflicts: [],
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.loadSession.mockReset();
  kit.loadSession.mockResolvedValue({ id: ID, status: "in_progress" });
  kit.runAnalyze.mockReset();
  kit.saveAnalysis.mockReset();
  kit.resolveAnalysisConflict.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => callRoute(route, { method: "POST", body });

describe("POST /api/selfeval/analyze run", () => {
  test("분석 결과와 시도 수를 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    kit.runAnalyze.mockResolvedValue({
      kind: "ok",
      result: { analysis, analysisSource: "model", currentStep: 3 },
      attempts: 2,
      softIssues: [{ code: "SHORT", message: "짧아요" }],
    });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    const parsed = analyzeRunResponse.parse(r.body);
    expect(parsed).toMatchObject({
      analysisSource: "model",
      currentStep: 3,
      attempts: 2,
      softIssues: [{ code: "SHORT" }],
    });
    expect(parsed.conflicts).toEqual([]);
    expect(kit.loadSession).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      ID,
    );
  });

  test("직접 입력 활동처럼 모델 없이 끝나면(done) attempts 없이 준다", async () => {
    kit.runAnalyze.mockResolvedValue({
      kind: "done",
      result: { analysis, analysisSource: "student", currentStep: 3 },
    });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(r.body).toMatchObject({ analysisSource: "student" });
  });

  test("앞 단계가 남았으면 409 STEP_ORDER 와 currentStep 확장 멤버다", async () => {
    kit.runAnalyze.mockResolvedValue({ kind: "order", currentStep: 1 });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "STEP_ORDER", currentStep: 1 });
  });

  test("검증 실패는 422 STEP_VALIDATION_FAILED 와 attempts, issues, terminal 이다", async () => {
    kit.runAnalyze.mockResolvedValue({
      kind: "failure",
      failure: "validation",
      issues: [{ code: "EMPTY", message: "비었어요" }],
      attempts: 3,
      terminal: true,
    });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({
      code: "STEP_VALIDATION_FAILED",
      attempts: 3,
      terminal: true,
      issues: [{ code: "EMPTY" }],
    });
  });

  test("시도를 모두 쓰면 409 ATTEMPTS_EXHAUSTED 와 terminal 이다", async () => {
    kit.runAnalyze.mockResolvedValue({ kind: "exhausted", terminal: true });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "ATTEMPTS_EXHAUSTED",
      terminal: true,
    });
  });
});

describe("POST /api/selfeval/analyze save, resolve-conflict", () => {
  test("save 는 고친 항목만 넘기고 analysis 만 준다", async () => {
    kit.saveAnalysis.mockResolvedValue({ kind: "done", result: { analysis } });
    const r = await post({
      sessionId: ID,
      action: "save",
      edits: { result: "고친 값" },
    });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    analyzeEditResponse.parse(r.body);
    expect(kit.saveAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ id: ID }),
      { result: "고친 값" },
    );
  });

  test("resolve-conflict 는 index 와 choice 를 넘긴다", async () => {
    kit.resolveAnalysisConflict.mockResolvedValue({
      kind: "done",
      result: { analysis },
    });
    const r = await post({
      sessionId: ID,
      action: "resolve-conflict",
      index: 1,
      choice: "b",
    });
    expect(r.status).toBe(200);
    analyzeEditResponse.parse(r.body);
    expect(kit.resolveAnalysisConflict).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ id: ID }),
      1,
      "b",
    );
  });

  test("범위를 벗어난 충돌 번호는 400 CONFLICT_INDEX_INVALID 를 지킨다", async () => {
    kit.resolveAnalysisConflict.mockResolvedValue({
      kind: "rejected",
      status: 400,
      code: "CONFLICT_INDEX_INVALID",
      message: "충돌 번호가 올바르지 않아요.",
    });
    const r = await post({
      sessionId: ID,
      action: "resolve-conflict",
      index: 9,
      choice: "a",
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "CONFLICT_INDEX_INVALID",
      detail: "충돌 번호가 올바르지 않아요.",
    });
  });
});

describe("요청 검사와 세션 검사", () => {
  test.each([
    ["본문이 비었다", {}],
    ["sessionId 가 uuid 가 아니다", { sessionId: "x", action: "run" }],
    ["action 을 모른다", { sessionId: ID, action: "zzz" }],
    [
      "edits 에 모르는 항목이 있다",
      { sessionId: ID, action: "save", edits: { nope: "a" } },
    ],
    [
      "index 가 음수다",
      { sessionId: ID, action: "resolve-conflict", index: -1, choice: "a" },
    ],
  ])(
    "%s 면 400 VALIDATION_FAILED 이고 세션을 읽지 않는다",
    async (_name, body) => {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(kit.loadSession).not.toHaveBeenCalled();
    },
  );

  test("없는 세션과 남의 세션은 404 SESSION_NOT_FOUND 다", async () => {
    kit.loadSession.mockResolvedValue(null);
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("이미 닫힌 세션은 409 SESSION_NOT_OPEN 이고 단계를 실행하지 않는다", async () => {
    kit.loadSession.mockResolvedValue({ id: ID, status: "completed" });
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 끝났거나 닫힌 자기평가서예요.",
    });
    expect(kit.runAnalyze).not.toHaveBeenCalled();
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이다", async () => {
    const r = await callRoute(route, {
      method: "POST",
      body: { sessionId: ID, action: "run" },
      headers: { authorization: "" },
    });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("POST 가 아니면 405 와 Allow 다", async () => {
    const r = await callRoute(route);
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("POST");
  });

  test("예상 못 한 오류는 500 problem 과 라우트 문구다", async () => {
    kit.loadSession.mockRejectedValue(new Error("db down"));
    const r = await post({ sessionId: ID, action: "run" });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "자기평가서 분석에 실패했습니다.",
    });
  });
});
