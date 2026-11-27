// POST /api/selfeval/pick-records: 연계 판정과 목록, 연계 편집, 선택, 직접 입력. Hono 라우트를 루트 앱으로 부른다.
// DB 계층과 모델은 가짜로 바꾼다. 성공 응답은 계약 스키마(shared/selfeval/pick.ts)로 읽어 서버와 브라우저가 같은 모양인지 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  pickLinkResponseSchema,
  pickListResponseSchema,
} from "../../../shared/selfeval/pick.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const m = vi.hoisted(() => ({
  state: { admin: null as unknown },
  readSelfevalAccess: vi.fn(),
  callStructured: vi.fn(),
  loadSession: vi.fn(),
  loadActivityRecords: vi.fn(),
  loadUsedActivityIds: vi.fn(),
  loadSessionActivities: vi.fn(),
  loadRecordLinks: vi.fn(),
  insertModelLinks: vi.fn(),
  saveRecordLink: vi.fn(),
  replaceSessionActivities: vi.fn(),
  updateSession: vi.fn(),
  claimStep: vi.fn(),
  finishStep: vi.fn(),
  terminateSession: vi.fn(),
  reverseCredit: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => m.state.admin,
}));
vi.mock("../../_lib/ai/gemini.js", () => ({
  callStructured: m.callStructured,
}));
vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: m.readSelfevalAccess,
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: m.loadSession,
  loadActivityRecords: m.loadActivityRecords,
  loadUsedActivityIds: m.loadUsedActivityIds,
  loadSessionActivities: m.loadSessionActivities,
  loadRecordLinks: m.loadRecordLinks,
  insertModelLinks: m.insertModelLinks,
  saveRecordLink: m.saveRecordLink,
  replaceSessionActivities: m.replaceSessionActivities,
  updateSession: m.updateSession,
  claimStep: m.claimStep,
  finishStep: m.finishStep,
  terminateSession: m.terminateSession,
  reverseCredit: m.reverseCredit,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/pick-records" };

const record = (id: string, p: Record<string, unknown> = {}) => ({
  id,
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: null,
  semester: null,
  subjectGroup: "수학",
  subject: "수학",
  topic: `주제${id}`,
  concept: `개념${id} 공통개념`,
  method: `방법${id}`,
  result: "결과를 보고 한계를 판단함 1 2",
  limitation: `한계${id}`,
  numbers: ["3", "4"],
  sources: [],
  createdAt: "2026-01-01T00:00:00Z",
  submittedAt: "2026-02-01T00:00:00Z",
  ...p,
});

const session = (stepState: unknown = {}) => ({
  id: "s1",
  profile_id: "me",
  status: "in_progress",
  current_step: 1,
  area: "subject",
  subject: "수학",
  activity_name: null,
  target_chars: 500,
  growth_snapshot: null,
  growth_applied: false,
  plan_item_id: null,
  step_state: stepState,
});

const okState = {
  steps: {
    link: {
      status: "ok",
      attempts: 1,
      startedAt: null,
      finishedAt: null,
      issues: [],
    },
  },
};

const call = (body: Record<string, unknown>) =>
  callRoute(route, { method: "POST", body: { sessionId: "s1", ...body } });

beforeEach(() => {
  vi.resetAllMocks();
  m.state.admin = createAdminFake({ permissions: [] });
  m.readSelfevalAccess.mockResolvedValue({ allowed: true, tenantReason: null });
  m.loadSession.mockResolvedValue(session());
  m.loadActivityRecords.mockResolvedValue([
    record("core", { topic: "핵심주제" }),
    record("a"),
    record("b", { subjectGroup: "국어", subject: "국어" }),
  ]);
  m.loadUsedActivityIds.mockResolvedValue(new Set());
  m.loadSessionActivities.mockResolvedValue([]);
  m.loadRecordLinks.mockResolvedValue([]);
  m.claimStep.mockResolvedValue({ kind: "claimed", attempts: 1 });
  m.finishStep.mockResolvedValue(true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const modelReply = (judgments: unknown[]) => ({
  text: JSON.stringify({ judgments }),
  finishReason: "STOP",
});

describe("pick-records link", () => {
  test("judges once with the model, stores new links and returns the checked list", async () => {
    m.callStructured.mockResolvedValue(
      modelReply([
        {
          from: "R0",
          to: "R1",
          linked: true,
          link_type: "background",
          strength: "explicit",
          quote_from: "개념core 공통개념",
          quote_to: "개념a 공통개념",
        },
      ]),
    );
    const res = await call({ action: "link" });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).not.toHaveProperty("ok");
    expect(m.callStructured).toHaveBeenCalledTimes(1);
    expect(m.claimStep.mock.calls[0]?.[3]).toBe("link");
    expect(m.insertModelLinks).toHaveBeenCalledTimes(1);
    expect(pickLinkResponseSchema.parse(res.body)).toMatchObject({
      linkStatus: "ok",
      linkUnchecked: false,
      maxSelect: 7,
      cached: false,
    });
  });

  test("does not call the model again once the link step is done", async () => {
    m.loadSession.mockResolvedValue(session(okState));
    m.loadRecordLinks.mockResolvedValue([
      {
        fromId: "core",
        toId: "a",
        type: "background",
        strength: "explicit",
        source: "model",
        confirmed: false,
        deleted: false,
        note: null,
        quoteFrom: "x",
        quoteTo: "y",
      },
    ]);
    const res = await call({ action: "link" });
    expect(m.callStructured).not.toHaveBeenCalled();
    expect(m.claimStep).not.toHaveBeenCalled();
    const body = pickLinkResponseSchema.parse(res.body);
    expect(body).toMatchObject({ cached: true, linkStatus: "ok" });
    expect(body.links).toHaveLength(1);
    expect(
      body.candidates.find((c) => c.activity.id === "a")?.linkState?.linked,
    ).toBe(true);
  });

  test("falls back to top 3 with linkUnchecked when the model fails, and keeps the session", async () => {
    m.callStructured.mockRejectedValue(new Error("boom"));
    const res = await call({ action: "link" });
    expect(res.status).toBe(200);
    expect(pickLinkResponseSchema.parse(res.body)).toMatchObject({
      linkUnchecked: true,
      linkStatus: "unchecked",
      maxSelect: 7,
      linkError: "MODEL_UPSTREAM_FAILED",
    });
    expect(m.terminateSession).not.toHaveBeenCalled();
    expect(m.insertModelLinks).not.toHaveBeenCalled();
  });

  test("falls back without ending the session when attempts are exhausted", async () => {
    m.claimStep.mockResolvedValue({ kind: "exhausted", attempts: 10 });
    const res = await call({ action: "link" });
    expect(res.body).toMatchObject({
      linkUnchecked: true,
      linkError: "ATTEMPTS_EXHAUSTED",
    });
    expect(m.callStructured).not.toHaveBeenCalled();
    expect(m.terminateSession).not.toHaveBeenCalled();
  });

  test("requires the basic input step first as a 409 STEP_ORDER problem", async () => {
    m.loadSession.mockResolvedValue({ ...session(), current_step: 0 });
    const res = await call({ action: "link" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "STEP_ORDER",
      detail: "기본 입력을 먼저 저장해 주세요.",
      requiredStep: 1,
    });
  });
});

describe("pick-records list", () => {
  test("returns the candidate list without an ok field and parses with the contract", async () => {
    const res = await call({ action: "list" });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("ok");
    const body = pickListResponseSchema.parse(res.body);
    expect(body.candidates.map((c) => c.activity.id).sort()).toEqual([
      "a",
      "b",
      "core",
    ]);
    expect(body).toMatchObject({
      linkStatus: "pending",
      selection: null,
      growthApplied: false,
      currentStep: 1,
    });
  });

  test("requires the basic input step first", async () => {
    m.loadSession.mockResolvedValue({ ...session(), current_step: 0 });
    const res = await call({ action: "list" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "STEP_ORDER" });
  });
});

describe("pick-records guards", () => {
  test("without a token it is a 401 UNAUTHENTICATED problem with no-store", async () => {
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: "s1", action: "list" },
      headers: { authorization: "" },
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("anything but POST is a 405 with Allow", async () => {
    const res = await callRoute(route, { method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  test("a bad body shape is a 400 VALIDATION_FAILED problem before any lookup", async () => {
    for (const body of [
      { action: "list" },
      { sessionId: "s1", action: "nope" },
      { sessionId: "s1", action: "select", coreId: 1 },
    ]) {
      const res = await callRoute(route, { method: "POST", body });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(m.readSelfevalAccess).not.toHaveBeenCalled();
    expect(m.loadSession).not.toHaveBeenCalled();
  });

  test("without an entitlement it is 403 NO_ENTITLEMENT and the session is not read", async () => {
    m.readSelfevalAccess.mockResolvedValue({
      allowed: false,
      tenantReason: null,
    });
    const res = await call({ action: "list" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
    expect(m.loadSession).not.toHaveBeenCalled();
  });

  test("a missing session is 404 SESSION_NOT_FOUND", async () => {
    m.loadSession.mockResolvedValue(null);
    const res = await call({ action: "list" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: "SESSION_NOT_FOUND",
      detail: "자기평가서 세션을 찾을 수 없어요.",
    });
  });

  test("a closed session is 409 SESSION_NOT_OPEN", async () => {
    m.loadSession.mockResolvedValue({ ...session(), status: "completed" });
    const res = await call({ action: "list" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "SESSION_NOT_OPEN" });
  });

  test("an unexpected failure is a 500 problem with the route message", async () => {
    m.loadActivityRecords.mockRejectedValue(new Error("db down"));
    const res = await call({ action: "list" });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      detail: "자기평가서 활동 선택에 실패했습니다.",
    });
  });
});
