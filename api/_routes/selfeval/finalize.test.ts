// POST /api/selfeval/finalize: Hono 라우트를 루트 앱으로 부른다.
// 세션과 리포트 읽기(db.js)와 단계 실행(steps/finalize.js)은 가짜로 바꾸고, 규칙은 steps/finalize.test.ts 가 본다.
// 응답은 계약 스키마(shared/selfeval/finalize.ts)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finalizeResponse } from "../../../shared/selfeval/finalize.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  loadSession: vi.fn(),
  loadReports: vi.fn(),
  runFinalize: vi.fn(),
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

vi.mock("../../_lib/selfeval/steps/finalize.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/steps/finalize.js")
  >()),
  runFinalize: kit.runFinalize,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/finalize" };
const ID = "123e4567-e89b-12d3-a456-426614174000";
const promoted = {
  topic: "주제",
  concept: "개념",
  method: "방법",
  result: "결과",
  limitation: "한계",
  numbers: ["3회"],
  sources: ["교과서"],
};
const done = {
  kind: "done",
  result: {
    activityRecordId: "a1",
    finalRevision: 3,
    reply: { status: "sent" },
    currentStep: 6,
  },
};

beforeEach(() => {
  kit.admin = createAdminFake({ permissions: [] });
  kit.loadSession.mockReset();
  kit.loadSession.mockResolvedValue({ id: ID, status: "in_progress" });
  kit.loadReports.mockReset();
  kit.loadReports.mockResolvedValue([]);
  kit.runFinalize.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => callRoute(route, { method: "POST", body });

describe("POST /api/selfeval/finalize", () => {
  test("저장 결과를 ok 필드 없이 주고 계약 스키마로 읽힌다", async () => {
    kit.runFinalize.mockResolvedValue(done);
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).not.toHaveProperty("ok");
    expect(finalizeResponse.parse(r.body)).toMatchObject({
      activityRecordId: "a1",
      finalRevision: 3,
      reply: { status: "sent" },
      currentStep: 6,
    });
    expect(kit.loadSession).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      ID,
    );
  });

  test("fulfillsPlanItem 과 acknowledgeMandatory 의 기본값을 채워 단계에 넘긴다", async () => {
    kit.runFinalize.mockResolvedValue(done);
    await post({ sessionId: ID, promoted: { ...promoted, topic: " 주제 " } });
    expect(kit.runFinalize.mock.calls[0]?.[4]).toEqual({
      sessionId: ID,
      promoted,
      fulfillsPlanItem: true,
      acknowledgeMandatory: false,
    });
    await post({
      sessionId: ID,
      promoted,
      fulfillsPlanItem: false,
      acknowledgeMandatory: true,
    });
    expect(kit.runFinalize.mock.calls[1]?.[4]).toMatchObject({
      fulfillsPlanItem: false,
      acknowledgeMandatory: true,
    });
  });

  test("이미 완료된 세션의 재요청도 단계로 간다(멱등)", async () => {
    kit.loadSession.mockResolvedValue({ id: ID, status: "completed" });
    kit.runFinalize.mockResolvedValue(done);
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(200);
    expect(kit.runFinalize).toHaveBeenCalledTimes(1);
  });

  test("회신 실패는 reply.status failed 와 code 로 200 이다", async () => {
    kit.runFinalize.mockResolvedValue({
      kind: "done",
      result: {
        ...done.result,
        reply: { status: "failed", code: "UPSTREAM" },
      },
    });
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      reply: { status: "failed", code: "UPSTREAM" },
    });
  });

  test("앞 단계가 남았으면 409 STEP_ORDER 와 currentStep 확장 멤버다", async () => {
    kit.runFinalize.mockResolvedValue({ kind: "order", currentStep: 4 });
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "STEP_ORDER", currentStep: 4 });
  });

  test.each([
    ["VERIFICATION_MISSING", "검증을 먼저 해 주세요."],
    ["VERIFICATION_STALE", "검증 뒤에 본문이 바뀌었어요."],
    ["NOT_SUBMITTABLE", "필수 수정이 남아 있어요."],
  ])("%s 는 409 로 코드와 문구를 지킨다", async (code, message) => {
    kit.runFinalize.mockResolvedValue({
      kind: "rejected",
      status: 409,
      code,
      message,
    });
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code, detail: message });
  });
});

describe("요청 검사와 세션 검사", () => {
  test.each([
    ["본문이 비었다", {}],
    ["sessionId 가 uuid 가 아니다", { sessionId: "x", promoted }],
    [
      "fulfillsPlanItem 이 boolean 이 아니다",
      { sessionId: ID, promoted, fulfillsPlanItem: "yes" },
    ],
    [
      "acknowledgeMandatory 가 boolean 이 아니다",
      { sessionId: ID, promoted, acknowledgeMandatory: "yes" },
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

  test.each([
    ["승격 항목이 없다", undefined],
    ["topic 이 비었다", { ...promoted, topic: "  " }],
    ["numbers 가 배열이 아니다", { ...promoted, numbers: "x" }],
    ["method 가 없다", { ...promoted, method: undefined }],
  ])(
    "%s 면 400 PROMOTED_INVALID 와 학생용 문구이고 세션을 읽지 않는다",
    async (_name, bad) => {
      const r = await post({ sessionId: ID, promoted: bad });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        code: "PROMOTED_INVALID",
        detail: "활동 기록으로 남길 7항목을 확인해 주세요.",
      });
      expect(kit.loadSession).not.toHaveBeenCalled();
    },
  );

  test("없는 세션과 남의 세션은 404 SESSION_NOT_FOUND 다", async () => {
    kit.loadSession.mockResolvedValue(null);
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("보관된 세션은 409 SESSION_NOT_OPEN 이고 단계를 실행하지 않는다", async () => {
    kit.loadSession.mockResolvedValue({ id: ID, status: "archived" });
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 끝났거나 닫힌 자기평가서예요.",
    });
    expect(kit.runFinalize).not.toHaveBeenCalled();
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이다", async () => {
    const r = await callRoute(route, {
      method: "POST",
      body: { sessionId: ID, promoted },
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
    const r = await post({ sessionId: ID, promoted });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "INTERNAL_ERROR",
      detail: "자기평가서 저장에 실패했습니다.",
    });
  });
});

describe("세션과 리포트 읽기", () => {
  test("세션 읽기와 리포트 읽기를 함께 시작한다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    kit.loadSession.mockReturnValue(
      gate.then(() => ({ id: ID, status: "in_progress" })),
    );
    kit.loadReports.mockReturnValue(gate.then(() => []));

    const request = post({ sessionId: ID, promoted });
    await vi.waitFor(() => {
      expect(kit.loadSession).toHaveBeenCalledTimes(1);
      expect(kit.loadReports).toHaveBeenCalledTimes(1);
    });
    release();

    await request;
  });

  test("없는 세션은 리포트 읽기가 실패해도 404 이다", async () => {
    kit.loadSession.mockResolvedValue(null);
    kit.loadReports.mockRejectedValue(new Error("읽지 않아야 하는 결과"));

    const r = await post({ sessionId: ID, promoted });

    expect(r.status).toBe(404);
  });
});
