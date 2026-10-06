import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  finalizeSession: vi.fn(),
  updateSession: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("../db.js", () => ({
  finalizeSession: mocks.finalizeSession,
  updateSession: mocks.updateSession,
}));

import type { ReportRow, SessionRow } from "../rows.js";
import type { GenerationSections } from "../types.js";
import { canFinalize, runFinalize, validateFinalizeBody } from "./finalize.js";

const db = {} as never;
const sid = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

const promoted = {
  topic: "미세먼지 측정",
  concept: "농도",
  method: "센서",
  result: "평균 35",
  limitation: "표본",
  numbers: ["평균 35"],
  sources: [],
};

const session = (p: Partial<SessionRow> = {}) =>
  ({
    id: "s1",
    status: "in_progress",
    current_step: 5,
    plan_item_id: null,
    reply_pending: null,
    ...p,
  }) as SessionRow;

const sections: GenerationSections = { paragraphs: [] };

const report = (p: Partial<ReportRow>): ReportRow => ({
  id: "r",
  session_id: "s1",
  report_type: "generation",
  revision: 1,
  sections,
  char_count: { withSpace: 10, withoutSpace: 8 },
  score: null,
  mandatory_fixes: null,
  created_at: "2026-10-06T00:00:00Z",
  ...p,
});

const gen = report({});
const ver = (submittable = true, at = "2026-10-06T00:10:00Z") =>
  report({
    id: "v",
    report_type: "verification",
    score: 82,
    sections: { submittable },
    created_at: at,
  });

describe("validateFinalizeBody", () => {
  it("승격 7항목이 있으면 통과하고 fulfillsPlanItem 기본값은 true 다", () => {
    expect(validateFinalizeBody({ sessionId: sid, promoted })).toEqual({
      ok: true,
      body: { sessionId: sid, promoted, fulfillsPlanItem: true },
    });
  });

  it("fulfillsPlanItem 을 false 로 줄 수 있다", () => {
    const r = validateFinalizeBody({
      sessionId: sid,
      promoted,
      fulfillsPlanItem: false,
    });
    expect(r.ok && r.body.fulfillsPlanItem).toBe(false);
  });

  it("topic 이 비어 있으면 PROMOTED_INVALID 다", () => {
    expect(
      validateFinalizeBody({
        sessionId: sid,
        promoted: { ...promoted, topic: "  " },
      }),
    ).toMatchObject({ ok: false, code: "PROMOTED_INVALID" });
  });

  it("승격 항목 형식이 틀리면 PROMOTED_INVALID 다", () => {
    expect(
      validateFinalizeBody({
        sessionId: sid,
        promoted: { ...promoted, numbers: "x" },
      }),
    ).toMatchObject({ ok: false, code: "PROMOTED_INVALID" });
    expect(
      validateFinalizeBody({
        sessionId: sid,
        promoted: { ...promoted, method: undefined },
      }),
    ).toMatchObject({ ok: false, code: "PROMOTED_INVALID" });
    expect(validateFinalizeBody({ sessionId: sid })).toMatchObject({
      ok: false,
      code: "PROMOTED_INVALID",
    });
  });

  it("sessionId 나 fulfillsPlanItem 형식이 틀리면 INVALID_BODY 다", () => {
    expect(validateFinalizeBody({ sessionId: "x", promoted })).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
    expect(
      validateFinalizeBody({
        sessionId: sid,
        promoted,
        fulfillsPlanItem: "yes",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_BODY" });
    expect(validateFinalizeBody(null)).toMatchObject({
      ok: false,
      code: "INVALID_BODY",
    });
  });
});

describe("canFinalize", () => {
  it("검증 완료(단계 5) 전이면 STEP_ORDER 다", () => {
    expect(canFinalize(session({ current_step: 4 }), [gen, ver()])).toEqual({
      ok: false,
      code: "STEP_ORDER",
    });
  });

  it("검증 리포트가 없으면 VERIFICATION_MISSING 이다", () => {
    expect(canFinalize(session(), [gen])).toEqual({
      ok: false,
      code: "VERIFICATION_MISSING",
    });
  });

  it("검증 뒤에 편집본이 생겼으면 VERIFICATION_STALE 이다", () => {
    const edited = report({
      id: "e",
      report_type: "edited",
      created_at: "2026-10-06T00:20:00Z",
    });
    expect(canFinalize(session(), [gen, ver(), edited])).toEqual({
      ok: false,
      code: "VERIFICATION_STALE",
    });
  });

  it("검증 뒤에 재생성했어도 VERIFICATION_STALE 이다", () => {
    const regen = report({
      id: "g2",
      revision: 2,
      created_at: "2026-10-06T00:30:00Z",
    });
    expect(canFinalize(session(), [gen, ver(), regen])).toEqual({
      ok: false,
      code: "VERIFICATION_STALE",
    });
  });

  it("필수 수정이 남아 제출 불가면 NOT_SUBMITTABLE 이다", () => {
    expect(canFinalize(session(), [gen, ver(false)])).toEqual({
      ok: false,
      code: "NOT_SUBMITTABLE",
    });
  });

  it("검증 뒤 변경이 없고 제출 가능이면 통과한다", () => {
    expect(canFinalize(session(), [gen, ver()])).toEqual({ ok: true });
  });
});

describe("runFinalize", () => {
  const deps = () => ({
    complete: mocks.complete as never,
    now: () => "2026-10-06T01:00:00.000Z",
  });
  const body = { sessionId: sid, promoted, fulfillsPlanItem: true };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.finalizeSession.mockResolvedValue({
      ok: true,
      reason: "completed",
      activityRecordId: "a1",
      finalRevision: 1,
    });
    mocks.complete.mockResolvedValue({ ok: true, changed: true, item: {} });
  });

  it("조건이 안 맞으면 RPC 를 부르지 않고 거절한다", async () => {
    const out = await runFinalize(db, "u1", session(), [gen], body, deps());
    expect(out).toMatchObject({
      kind: "rejected",
      status: 409,
      code: "VERIFICATION_MISSING",
    });
    expect(mocks.finalizeSession).not.toHaveBeenCalled();
  });

  it("단계 부족은 order 로 돌려준다", async () => {
    const out = await runFinalize(
      db,
      "u1",
      session({ current_step: 4 }),
      [gen, ver()],
      body,
      deps(),
    );
    expect(out).toEqual({ kind: "order", currentStep: 4 });
  });

  it("현재 본문과 최신 검증 점수로 최종 저장하고 성장설계 항목이 없으면 skipped 다", async () => {
    const out = await runFinalize(
      db,
      "u1",
      session(),
      [gen, ver()],
      body,
      deps(),
    );
    expect(mocks.finalizeSession).toHaveBeenCalledWith(db, "u1", "s1", {
      promoted,
      sections,
      charCount: { withSpace: 10, withoutSpace: 8 },
      score: 82,
    });
    expect(out).toEqual({
      kind: "done",
      result: {
        activityRecordId: "a1",
        finalRevision: 1,
        reply: { status: "skipped" },
        currentStep: 6,
      },
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("성장설계 항목이 있으면 확정 회신을 보내고 sent 다", async () => {
    const out = await runFinalize(
      db,
      "u1",
      session({ plan_item_id: "p1" }),
      [gen, ver()],
      body,
      deps(),
    );
    expect(mocks.complete).toHaveBeenCalledWith(db, "u1", {
      itemId: "p1",
      program: "self",
      refId: "a1",
      nowIso: "2026-10-06T01:00:00.000Z",
    });
    expect(out).toMatchObject({
      kind: "done",
      result: { reply: { status: "sent" } },
    });
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("fulfillsPlanItem 이 false 면 회신하지 않고 skipped 다", async () => {
    const out = await runFinalize(
      db,
      "u1",
      session({ plan_item_id: "p1" }),
      [gen, ver()],
      { ...body, fulfillsPlanItem: false },
      deps(),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(out).toMatchObject({ result: { reply: { status: "skipped" } } });
  });

  it("회신이 실패하면 reply_pending 을 남기고 failed 와 코드를 알린다", async () => {
    mocks.complete.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "다시 시도",
    });
    const out = await runFinalize(
      db,
      "u1",
      session({ plan_item_id: "p1" }),
      [gen, ver()],
      body,
      deps(),
    );
    expect(mocks.updateSession).toHaveBeenCalledWith(db, "u1", "s1", {
      reply_pending: {
        itemId: "p1",
        refId: "a1",
        failedAt: "2026-10-06T01:00:00.000Z",
        lastError: "CONFLICT: 다시 시도",
      },
    });
    expect(out).toMatchObject({
      kind: "done",
      result: { reply: { status: "failed", code: "CONFLICT" } },
    });
  });

  it("회신 호출이 던져도 저장은 성공이고 failed 로 알린다", async () => {
    mocks.complete.mockRejectedValue(new Error("db down"));
    const out = await runFinalize(
      db,
      "u1",
      session({ plan_item_id: "p1" }),
      [gen, ver()],
      body,
      deps(),
    );
    expect(out).toMatchObject({
      kind: "done",
      result: { reply: { status: "failed", code: "REPLY_ERROR" } },
    });
    expect(mocks.updateSession).toHaveBeenCalled();
  });

  describe("이미 완료된 세션(멱등)", () => {
    const done = (p: Partial<SessionRow> = {}) =>
      session({ status: "completed", current_step: 6, ...p });
    beforeEach(() => {
      mocks.finalizeSession.mockResolvedValue({
        ok: true,
        reason: "already_completed",
        activityRecordId: "a1",
        finalRevision: 2,
      });
    });

    it("검증 뒤 변경 검사를 건너뛰고 같은 결과를 돌려준다", async () => {
      const edited = report({
        id: "e",
        report_type: "edited",
        created_at: "2026-10-06T00:20:00Z",
      });
      const out = await runFinalize(
        db,
        "u1",
        done(),
        [gen, ver(), edited],
        body,
        deps(),
      );
      expect(out).toMatchObject({
        kind: "done",
        result: { activityRecordId: "a1", finalRevision: 2 },
      });
    });

    it("회신 대기가 없으면 이미 보낸 것으로 보고 다시 보내지 않는다", async () => {
      const out = await runFinalize(
        db,
        "u1",
        done({ plan_item_id: "p1" }),
        [gen, ver()],
        body,
        deps(),
      );
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(out).toMatchObject({ result: { reply: { status: "sent" } } });
    });

    it("회신 대기가 남아 있으면 다시 보내고 성공하면 대기를 비운다", async () => {
      const pending = {
        itemId: "p1",
        refId: "a1",
        failedAt: "x",
        lastError: "y",
      };
      const out = await runFinalize(
        db,
        "u1",
        done({ plan_item_id: "p1", reply_pending: pending }),
        [gen, ver()],
        body,
        deps(),
      );
      expect(mocks.complete).toHaveBeenCalledOnce();
      expect(mocks.updateSession).toHaveBeenCalledWith(db, "u1", "s1", {
        reply_pending: null,
      });
      expect(out).toMatchObject({ result: { reply: { status: "sent" } } });
    });
  });

  it("RPC 가 not_found 면 404, not_ready 면 STEP_ORDER 409 다", async () => {
    mocks.finalizeSession.mockResolvedValue({ ok: false, reason: "not_found" });
    expect(
      await runFinalize(db, "u1", session(), [gen, ver()], body, deps()),
    ).toMatchObject({
      kind: "rejected",
      status: 404,
      code: "SESSION_NOT_FOUND",
    });
    mocks.finalizeSession.mockResolvedValue({ ok: false, reason: "not_ready" });
    expect(
      await runFinalize(db, "u1", session(), [gen, ver()], body, deps()),
    ).toMatchObject({ kind: "rejected", status: 409, code: "STEP_ORDER" });
  });

  it("모르는 RPC 결과는 던진다", async () => {
    mocks.finalizeSession.mockResolvedValue({ ok: "?" });
    await expect(
      runFinalize(db, "u1", session(), [gen, ver()], body, deps()),
    ).rejects.toThrow();
  });
});
