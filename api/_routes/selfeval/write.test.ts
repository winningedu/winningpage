// POST /api/selfeval/write: Hono 라우트를 루트 앱으로 부른다.
// 세션과 리포트 읽기(db.js)와 단계 실행(steps/write.js)은 가짜로 바꾸고, 규칙은 steps/write.test.ts 가 본다.
// 응답은 계약 스키마(shared/selfeval/write.ts)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  writeEditResponse,
  writeGenerateResponse,
} from "../../../shared/selfeval/write.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  loadSession: vi.fn(),
  loadReports: vi.fn(),
  runWrite: vi.fn(),
  saveEdit: vi.fn(),
  confirmFeelingSentence: vi.fn(),
  repickSentenceEvidence: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: kit.loadSession,
  loadReports: kit.loadReports,
}));

vi.mock("../../_lib/selfeval/steps/write.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/steps/write.js")
  >()),
  runWrite: kit.runWrite,
  saveEdit: kit.saveEdit,
  confirmFeelingSentence: kit.confirmFeelingSentence,
  repickSentenceEvidence: kit.repickSentenceEvidence,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/write" };
const ID = "123e4567-e89b-12d3-a456-426614174000";
const sections = { paragraphs: [{ sentences: [] }] };
const report = {
  id: "r1",
  revision: 1,
  sections,
  charCount: { withSpace: 10, withoutSpace: 8 },
};
const generationRow = {
  id: "g1",
  session_id: ID,
  report_type: "generation",
  revision: 1,
  sections,
  char_count: { withSpace: 10, withoutSpace: 8 },
  score: null,
  mandatory_fixes: null,
  created_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.loadSession.mockReset();
  kit.loadSession.mockResolvedValue({
    id: ID,
    status: "in_progress",
    current_step: 4,
    step_state: {},
    career: {},
  });
  kit.loadReports.mockReset();
  kit.loadReports.mockResolvedValue([generationRow]);
  for (const fn of [
    kit.runWrite,
    kit.saveEdit,
    kit.confirmFeelingSentence,
    kit.repickSentenceEvidence,
  ]) {
    fn.mockReset();
  }
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => callRoute(route, { method: "POST", body });

describe("POST /api/selfeval/write generate", () => {
  test("본문과 차감 여부를 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    kit.runWrite.mockResolvedValue({
      kind: "ok",
      result: { report, charged: false, regenerationsLeft: 2, currentStep: 4 },
      attempts: 1,
      softIssues: [{ code: "LEN", message: "짧아요" }],
    });
    const r = await post({ sessionId: ID, action: "generate" });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    expect(writeGenerateResponse.parse(r.body)).toMatchObject({
      charged: false,
      regenerationsLeft: 2,
      currentStep: 4,
      attempts: 1,
      softIssues: [{ code: "LEN" }],
    });
    expect(kit.loadSession).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      ID,
    );
    expect(kit.loadReports).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      ID,
    );
  });

  test("본문이 아직 없어도 generate 는 실행한다", async () => {
    kit.loadReports.mockResolvedValue([]);
    kit.runWrite.mockResolvedValue({
      kind: "ok",
      result: { report, charged: true, regenerationsLeft: 3, currentStep: 4 },
      attempts: 1,
      softIssues: [],
    });
    const r = await post({ sessionId: ID, action: "generate" });
    expect(r.status).toBe(200);
  });

  test.each([
    [
      { kind: "no_entitlement", tenantReason: "month_cap" },
      403,
      "NO_ENTITLEMENT",
      { tenantReason: "month_cap" },
    ],
    [{ kind: "quota_exhausted" }, 409, "QUOTA_EXHAUSTED", {}],
    [{ kind: "regenerate_exhausted" }, 409, "REGENERATE_EXHAUSTED", {}],
    [{ kind: "order", currentStep: 2 }, 409, "STEP_ORDER", { currentStep: 2 }],
    [
      { kind: "exhausted", terminal: true },
      409,
      "ATTEMPTS_EXHAUSTED",
      { terminal: true },
    ],
    [
      {
        kind: "failure",
        failure: "validation",
        issues: [{ code: "X", message: "m" }],
        attempts: 2,
        terminal: false,
      },
      422,
      "STEP_VALIDATION_FAILED",
      { attempts: 2, issues: [{ code: "X", message: "m" }] },
    ],
    [
      {
        kind: "rejected",
        status: 409,
        code: "CONFLICTS_UNRESOLVED",
        message: "충돌을 먼저 정해 주세요.",
      },
      409,
      "CONFLICTS_UNRESOLVED",
      {},
    ],
  ])(
    "단계 결과 %j 는 %i %s 와 확장 멤버로 나간다",
    async (outcome, status, code, extra) => {
      kit.runWrite.mockResolvedValue(outcome);
      const r = await post({ sessionId: ID, action: "generate" });
      expect(r.status).toBe(status);
      expect(r.body).toMatchObject({ code, ...extra });
    },
  );
});

describe("POST /api/selfeval/write edit, confirm-feeling, repick-evidence", () => {
  test("edit 는 현재 본문을 기준으로 문단을 넘기고 report 만 준다", async () => {
    kit.saveEdit.mockResolvedValue({ kind: "done", result: { report } });
    const r = await post({
      sessionId: ID,
      action: "edit",
      paragraphs: ["a", "b"],
    });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    writeEditResponse.parse(r.body);
    expect(kit.saveEdit).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ id: ID }),
      expect.objectContaining({ paragraphs: expect.any(Array) }),
      ["a", "b"],
    );
  });

  test("문단 수 오류는 400 PARAGRAPH_COUNT 를 지킨다", async () => {
    kit.saveEdit.mockResolvedValue({
      kind: "rejected",
      status: 400,
      code: "PARAGRAPH_COUNT",
      message: "문단 수가 올바르지 않아요.",
    });
    const r = await post({ sessionId: ID, action: "edit", paragraphs: ["a"] });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "PARAGRAPH_COUNT",
      detail: "문단 수가 올바르지 않아요.",
    });
  });

  test("confirm-feeling 은 sentenceId 를 넘긴다", async () => {
    kit.confirmFeelingSentence.mockResolvedValue({
      kind: "done",
      result: { report },
    });
    const r = await post({
      sessionId: ID,
      action: "confirm-feeling",
      sentenceId: "p1-s2",
    });
    expect(r.status).toBe(200);
    writeEditResponse.parse(r.body);
    expect(kit.confirmFeelingSentence).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ id: ID }),
      expect.objectContaining({ paragraphs: expect.any(Array) }),
      "p1-s2",
    );
  });

  test("repick-evidence 는 sentenceId 와 picks 를 넘기고 없는 문장은 404 SENTENCE_NOT_FOUND 를 지킨다", async () => {
    const picks = [{ refId: "a1", item: "method" }];
    kit.repickSentenceEvidence.mockResolvedValueOnce({
      kind: "done",
      result: { report },
    });
    const ok = await post({
      sessionId: ID,
      action: "repick-evidence",
      sentenceId: "p1-s2",
      picks,
    });
    expect(ok.status).toBe(200);
    expect(kit.repickSentenceEvidence).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      expect.objectContaining({ id: ID }),
      expect.objectContaining({ paragraphs: expect.any(Array) }),
      "p1-s2",
      picks,
    );
    kit.repickSentenceEvidence.mockResolvedValueOnce({
      kind: "rejected",
      status: 404,
      code: "SENTENCE_NOT_FOUND",
      message: "문장을 찾을 수 없어요.",
    });
    const missing = await post({
      sessionId: ID,
      action: "repick-evidence",
      sentenceId: "zz",
      picks,
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "SENTENCE_NOT_FOUND" });
  });

  test.each([
    ["edit", { paragraphs: ["a"] }],
    ["confirm-feeling", { sentenceId: "p1-s1" }],
    ["repick-evidence", { sentenceId: "p1-s1", picks: [] }],
  ])(
    "%s 는 본문이 아직 없으면 409 STEP_ORDER 와 currentStep 이다",
    async (action, extra) => {
      kit.loadReports.mockResolvedValue([]);
      const r = await post({ sessionId: ID, action, ...extra });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({
        code: "STEP_ORDER",
        detail: "본문을 먼저 생성해 주세요.",
        currentStep: 4,
      });
      expect(kit.saveEdit).not.toHaveBeenCalled();
      expect(kit.confirmFeelingSentence).not.toHaveBeenCalled();
      expect(kit.repickSentenceEvidence).not.toHaveBeenCalled();
    },
  );
});

describe("요청 검사와 세션 검사", () => {
  test.each([
    ["본문이 비었다", {}],
    ["sessionId 가 uuid 가 아니다", { sessionId: "x", action: "generate" }],
    ["action 을 모른다", { sessionId: ID, action: "zzz" }],
    ["edit 문단이 비었다", { sessionId: ID, action: "edit", paragraphs: [] }],
    [
      "confirm-feeling 에 sentenceId 가 없다",
      { sessionId: ID, action: "confirm-feeling" },
    ],
    [
      "repick-evidence 에 picks 가 없다",
      { sessionId: ID, action: "repick-evidence", sentenceId: "s" },
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
    const r = await post({ sessionId: ID, action: "generate" });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("이미 닫힌 세션은 409 SESSION_NOT_OPEN 이고 단계를 실행하지 않는다", async () => {
    kit.loadSession.mockResolvedValue({ id: ID, status: "completed" });
    const r = await post({ sessionId: ID, action: "generate" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 끝났거나 닫힌 자기평가서예요.",
    });
    expect(kit.runWrite).not.toHaveBeenCalled();
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이다", async () => {
    const r = await callRoute(route, {
      method: "POST",
      body: { sessionId: ID, action: "generate" },
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
    const r = await post({ sessionId: ID, action: "generate" });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "자기평가서 본문 처리에 실패했습니다.",
    });
  });
});
