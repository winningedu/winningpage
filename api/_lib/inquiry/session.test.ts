// 심화탐구 세션 규칙 테스트(명세 No.21~26, 53, 22, 개발계획 §2 3, 4, 10, 11, §6 11).
import { describe, expect, it } from "vitest";
import {
  canEvaluate,
  canStartNewSession,
  expiryCutoffIso,
  gateFor,
  interpretClaim,
  isExpired,
  nextRound,
  parseGenerationState,
  requiredStepFor,
  screenStepFor,
  shouldTerminate,
} from "./session.js";

describe("isExpired / expiryCutoffIso (No.26, §6 11)", () => {
  it("마지막 활동 후 90일째 당일부터 만료다", () => {
    expect(isExpired("2026-07-08T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(
      true,
    );
    expect(isExpired("2026-07-08T00:00:01Z", "2026-10-06T00:00:00Z")).toBe(
      false,
    );
    expect(isExpired("2026-07-09T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(
      false,
    );
  });
  it("기준 시각은 지금보다 90일 전이고 그 이전 활동은 만료다", () => {
    const cutoff = expiryCutoffIso("2026-10-06T00:00:00Z");
    expect(cutoff).toBe("2026-07-08T00:00:00.000Z");
    expect(isExpired(cutoff, "2026-10-06T00:00:00Z")).toBe(true);
  });
});

describe("canStartNewSession (§2 4, No.20)", () => {
  it("열린 세션이 있으면 잔여가 0 이어도 허용한다", () => {
    expect(
      canStartNewSession({ openSession: true, quotaRemaining: 0 }),
    ).toEqual({ ok: true });
  });
  it("열린 세션이 없고 잔여가 0 이면 막는다", () => {
    expect(
      canStartNewSession({ openSession: false, quotaRemaining: 0 }),
    ).toEqual({
      ok: false,
      code: "QUOTA_EXHAUSTED",
    });
  });
  it("잔여가 있거나 무제한(null)이면 허용한다", () => {
    expect(
      canStartNewSession({ openSession: false, quotaRemaining: 1 }),
    ).toEqual({ ok: true });
    expect(
      canStartNewSession({ openSession: false, quotaRemaining: null }),
    ).toEqual({ ok: true });
  });
});

describe("nextRound (No.53)", () => {
  it("최초 1 + 재추천 3 까지 4라운드다", () => {
    expect(nextRound(0)).toEqual({ ok: true, round: 1 });
    expect(nextRound(3)).toEqual({ ok: true, round: 4 });
    expect(nextRound(4)).toEqual({ ok: false, code: "ROUND_LIMIT" });
  });
});

describe("canEvaluate (No.22)", () => {
  it("평가 성공 4회까지(최초 1 + 재평가 3)다", () => {
    expect(canEvaluate(0)).toEqual({ ok: true });
    expect(canEvaluate(3)).toEqual({ ok: true });
    expect(canEvaluate(4)).toEqual({ ok: false, code: "REEVALUATION_LIMIT" });
  });
});

describe("requiredStepFor", () => {
  it("동작이 일어나는 화면 단계를 돌려준다", () => {
    expect(requiredStepFor("topic_recommendation")).toBe(2);
    expect(requiredStepFor("design_report")).toBe(3);
    expect(requiredStepFor("submission")).toBe(4);
    expect(requiredStepFor("evaluation_report")).toBe(5);
    expect(requiredStepFor("finalize")).toBe(6);
  });
});

describe("gateFor (No.25, 113~115)", () => {
  const open = {
    status: "in_progress" as const,
    selectedTopicId: null as string | null,
    designReportId: null as string | null,
    latestEvaluationId: null as string | null,
  };
  it("draft, in_progress 가 아니면 SESSION_NOT_OPEN 이다", () => {
    expect(
      gateFor({ ...open, status: "completed" }, "topic_recommendation"),
    ).toEqual({ ok: false, code: "SESSION_NOT_OPEN" });
    expect(gateFor({ ...open, status: "archived" }, "design_report")).toEqual({
      ok: false,
      code: "SESSION_NOT_OPEN",
    });
    expect(gateFor({ ...open, status: "draft" }, "assets")).toEqual({
      ok: true,
    });
  });
  it("설계 리포트가 있으면 자산 변경과 재추천은 SESSION_LOCKED 다", () => {
    const s = { ...open, selectedTopicId: "t", designReportId: "d" };
    expect(gateFor(s, "assets")).toEqual({ ok: false, code: "SESSION_LOCKED" });
    expect(gateFor(s, "topic_recommendation")).toEqual({
      ok: false,
      code: "SESSION_LOCKED",
    });
    expect(gateFor(open, "topic_recommendation")).toEqual({ ok: true });
  });
  it("설계 리포트 생성은 선택된 주제가 있어야 한다", () => {
    expect(gateFor(open, "design_report")).toEqual({
      ok: false,
      code: "STEP_ORDER",
    });
    expect(gateFor({ ...open, selectedTopicId: "t" }, "design_report")).toEqual(
      { ok: true },
    );
  });
  it("작성본 저장과 평가는 설계 리포트가 있어야 한다", () => {
    expect(gateFor(open, "submission")).toEqual({
      ok: false,
      code: "STEP_ORDER",
    });
    expect(gateFor(open, "evaluation_report")).toEqual({
      ok: false,
      code: "STEP_ORDER",
    });
    const s = { ...open, designReportId: "d" };
    expect(gateFor(s, "submission")).toEqual({ ok: true });
    expect(gateFor(s, "evaluation_report")).toEqual({ ok: true });
  });
  it("확정은 평가 리포트가 있어야 한다", () => {
    expect(gateFor({ ...open, designReportId: "d" }, "finalize")).toEqual({
      ok: false,
      code: "STEP_ORDER",
    });
    expect(
      gateFor(
        { ...open, designReportId: "d", latestEvaluationId: "e" },
        "finalize",
      ),
    ).toEqual({ ok: true });
  });
});

describe("screenStepFor (No.113~115, 이어하기)", () => {
  const base = {
    status: "in_progress" as const,
    selectedTopicId: null as string | null,
    designReportId: null as string | null,
    latestEvaluationId: null as string | null,
    hasSubmissionDraft: false,
    hasTopics: false,
  };
  it("진행 정도에 따라 이어갈 화면을 정한다", () => {
    expect(screenStepFor(base)).toBe(1);
    expect(screenStepFor({ ...base, hasTopics: true })).toBe(2);
    expect(
      screenStepFor({ ...base, hasTopics: true, designReportId: "d" }),
    ).toBe(4);
    expect(
      screenStepFor({ ...base, designReportId: "d", hasSubmissionDraft: true }),
    ).toBe(4);
    expect(
      screenStepFor({
        ...base,
        designReportId: "d",
        hasSubmissionDraft: true,
        latestEvaluationId: "e",
      }),
    ).toBe(5);
    expect(
      screenStepFor({ ...base, status: "completed", latestEvaluationId: "e" }),
    ).toBe(6);
  });
  it("작성본만 있어도 설계 없이 4 가 되고 completed 는 항상 6 이다", () => {
    expect(screenStepFor({ ...base, hasSubmissionDraft: true })).toBe(4);
    expect(screenStepFor({ ...base, status: "completed" })).toBe(6);
  });
});

describe("parseGenerationState (§2 11)", () => {
  it("빈 입력은 세 mode 모두 pending 0 이고 terminal 은 null 이다", () => {
    for (const raw of [null, undefined, {}, "x", []]) {
      const s = parseGenerationState(raw);
      expect(s.terminal).toBeNull();
      expect(s.modes.topic_recommendation).toEqual({
        status: "pending",
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        issues: [],
      });
      expect(Object.keys(s.modes).sort()).toEqual([
        "design_report",
        "evaluation_report",
        "topic_recommendation",
      ]);
    }
  });
  it("저장된 값을 읽고 잘못된 값은 안전한 기본으로 둔다", () => {
    const s = parseGenerationState({
      modes: {
        design_report: {
          status: "running",
          attempts: 2,
          startedAt: "2026-10-06T00:00:00Z",
          finishedAt: null,
          issues: [{ code: "x" }],
        },
        evaluation_report: {
          status: "weird",
          attempts: -3,
          startedAt: 5,
          issues: "no",
        },
      },
      terminal: {
        reason: "attempts_exhausted",
        at: "2026-10-06T01:00:00Z",
        mode: "design_report",
      },
    });
    expect(s.modes.design_report).toEqual({
      status: "running",
      attempts: 2,
      startedAt: "2026-10-06T00:00:00Z",
      finishedAt: null,
      issues: [{ code: "x" }],
    });
    expect(s.modes.evaluation_report).toEqual({
      status: "pending",
      attempts: 0,
      startedAt: null,
      finishedAt: null,
      issues: [],
    });
    expect(s.terminal).toEqual({
      reason: "attempts_exhausted",
      at: "2026-10-06T01:00:00Z",
      mode: "design_report",
    });
  });
  it("terminal 의 필드가 빠지면 null 이다", () => {
    expect(
      parseGenerationState({ terminal: { reason: "x" } }).terminal,
    ).toBeNull();
  });
});

describe("interpretClaim (fn_inquiry_claim_generation 반환)", () => {
  it("kind 별로 해석한다", () => {
    expect(interpretClaim({ kind: "claimed", attempts: 3 })).toEqual({
      kind: "claimed",
      attempts: 3,
    });
    expect(interpretClaim({ kind: "running" })).toEqual({ kind: "running" });
    expect(interpretClaim({ kind: "locked" })).toEqual({ kind: "locked" });
    expect(interpretClaim({ kind: "exhausted", attempts: 10 })).toEqual({
      kind: "exhausted",
      attempts: 10,
    });
  });
  it("모르는 kind 나 attempts 가 없는 claimed 는 invalid 다", () => {
    expect(interpretClaim(null)).toEqual({ kind: "invalid" });
    expect(interpretClaim({ kind: "other" })).toEqual({ kind: "invalid" });
    expect(interpretClaim({ kind: "claimed" })).toEqual({ kind: "invalid" });
    expect(interpretClaim({ kind: "exhausted", attempts: "10" })).toEqual({
      kind: "invalid",
    });
  });
});

describe("shouldTerminate (§2 10)", () => {
  it("복구 불가 오류는 즉시 종결한다", () => {
    expect(shouldTerminate("fatal", 1)).toBe(true);
  });
  it("그 외는 시도 10회째부터 종결한다", () => {
    expect(shouldTerminate("validation", 9)).toBe(false);
    expect(shouldTerminate("upstream", 10)).toBe(true);
    expect(shouldTerminate("timeout", 11)).toBe(true);
    expect(shouldTerminate("timeout", 1)).toBe(false);
  });
});
