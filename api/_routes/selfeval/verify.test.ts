// POST /api/selfeval/verify: Hono 라우트를 루트 앱으로 부른다.
// 세션과 리포트 읽기(db.js)와 단계 실행(steps/verify.js)은 가짜로 바꾸고, 규칙은 steps/verify.test.ts 가 본다.
// 응답은 계약 스키마(shared/selfeval/verify.ts)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { verifyResponse } from "../../../shared/selfeval/verify.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  loadSession: vi.fn(),
  loadReports: vi.fn(),
  runVerify: vi.fn(),
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

vi.mock("../../_lib/selfeval/steps/verify.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/steps/verify.js")
  >()),
  runVerify: kit.runVerify,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/verify" };
const ID = "123e4567-e89b-12d3-a456-426614174000";
const verification = {
  id: "r1",
  revision: 2,
  sections: {
    items: [],
    total: 80,
    format: [],
    mandatoryFixes: [],
    submittable: true,
    improvements: [],
    excluded: [],
    growthFit: null,
    charCount: { withSpace: 10, withoutSpace: 8 },
    sentenceCount: 1,
    clicheDensity: 0,
    clicheHits: [],
    numberCount: 0,
  },
  score: 80,
  mandatoryFixes: [],
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.loadSession.mockReset();
  kit.loadSession.mockResolvedValue({ id: ID, status: "in_progress" });
  kit.loadReports.mockReset();
  kit.loadReports.mockResolvedValue([]);
  kit.runVerify.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => callRoute(route, { method: "POST", body });

describe("POST /api/selfeval/verify", () => {
  test("검증 리포트와 차감 여부를 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    kit.runVerify.mockResolvedValue({
      kind: "ok",
      result: { verification, charged: true, currentStep: 5 },
      attempts: 1,
      softIssues: [],
    });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    const parsed = verifyResponse.parse(r.body);
    expect(parsed).toMatchObject({
      charged: true,
      currentStep: 5,
      attempts: 1,
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

  test("이용권이 없으면 403 NO_ENTITLEMENT 와 tenantReason 확장 멤버다", async () => {
    kit.runVerify.mockResolvedValue({
      kind: "no_entitlement",
      tenantReason: "month_cap",
    });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      code: "NO_ENTITLEMENT",
      tenantReason: "month_cap",
    });
  });

  test("차감을 되돌린 실패는 reversed 와 attempts, issues 확장 멤버를 싣는다", async () => {
    kit.runVerify.mockResolvedValue({
      kind: "failure",
      failure: "upstream",
      issues: [],
      attempts: 1,
      terminal: false,
      reversed: true,
    });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({
      code: "MODEL_UPSTREAM_FAILED",
      reversed: true,
      attempts: 1,
      issues: [],
    });
  });

  test("본문 편집이 없는 세션은 409 STEP_ORDER 와 currentStep 이다", async () => {
    kit.runVerify.mockResolvedValue({ kind: "order", currentStep: 3 });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "STEP_ORDER", currentStep: 3 });
  });

  test("횟수를 모두 쓰면 409 QUOTA_EXHAUSTED 다", async () => {
    kit.runVerify.mockResolvedValue({ kind: "quota_exhausted" });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "QUOTA_EXHAUSTED" });
  });
});

describe("요청 검사와 세션 검사", () => {
  test.each([
    ["본문이 비었다", {}],
    ["sessionId 가 uuid 가 아니다", { sessionId: "x" }],
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
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("이미 닫힌 세션은 409 SESSION_NOT_OPEN 이고 단계를 실행하지 않는다", async () => {
    kit.loadSession.mockResolvedValue({ id: ID, status: "archived" });
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 끝났거나 닫힌 자기평가서예요.",
    });
    expect(kit.runVerify).not.toHaveBeenCalled();
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이다", async () => {
    const r = await callRoute(route, {
      method: "POST",
      body: { sessionId: ID },
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
    const r = await post({ sessionId: ID });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "자기평가서 검증에 실패했습니다.",
    });
  });
});
