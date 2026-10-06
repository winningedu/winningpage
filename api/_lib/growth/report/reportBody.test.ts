import { describe, expect, it } from "vitest";
import { MAX_MODEL_ATTEMPTS_PER_STEP } from "../validation.js";
import {
  callModelWith,
  claimErrorOf,
  failureErrorOf,
  shouldTerminate,
  stepResponse,
  toStoredOutputs,
  validateReportBody,
} from "./reportBody.js";
import { emptyStepRecord } from "./stepState.js";
import type { StepState } from "./types.js";

const ID = "6f1c2a4e-1b2d-4c3e-8f9a-0123456789ab";

describe("validateReportBody", () => {
  it("올바른 reportId 와 step 을 받는다", () => {
    expect(validateReportBody({ reportId: ID, step: 3 })).toEqual({
      ok: true,
      body: { reportId: ID, step: 3 },
    });
  });

  it.each([
    [null],
    ["x"],
    [{ step: 1 }],
    [{ reportId: "abc", step: 1 }],
    [{ reportId: ID, step: 0 }],
    [{ reportId: ID, step: 9 }],
    [{ reportId: ID, step: 1.5 }],
    [{ reportId: ID, step: "2" }],
  ])("잘못된 바디는 거부한다 %#", (raw) => {
    const r = validateReportBody(raw);
    expect(r.ok).toBe(false);
  });
});

describe("stepResponse", () => {
  const state: StepState = {
    steps: {
      1: { ...emptyStepRecord(), status: "ok", attempts: 1 },
      2: { ...emptyStepRecord(), status: "failed", attempts: 2 },
    },
  };

  it("해당 단계 시도 횟수, 다음 단계, 진행 목록을 싣는다", () => {
    const r = stepResponse({ reportId: ID, step: 2, state, result: "failed" });
    expect(r).toMatchObject({
      ok: true,
      reportId: ID,
      step: 2,
      result: "failed",
      attempts: 2,
      nextStep: 2,
    });
    expect(r.progress).toHaveLength(8);
  });

  it("선택 필드는 주어졌을 때만 싣는다", () => {
    const bare = stepResponse({ reportId: ID, step: 1, state, result: "ok" });
    expect(bare).not.toHaveProperty("issues");
    expect(bare).not.toHaveProperty("charged");
    expect(bare).not.toHaveProperty("completion");
    const full = stepResponse({
      reportId: ID,
      step: 1,
      state,
      result: "ok",
      issues: [{ code: "a", message: "b" }],
      charged: false,
      completion: { issuedAt: "t", planItemCount: 4 },
    });
    expect(full.charged).toBe(false);
    expect(full.completion).toEqual({ issuedAt: "t", planItemCount: 4 });
    expect(full.issues).toHaveLength(1);
  });
});

describe("claimErrorOf", () => {
  it("선점 거절 종류를 상태와 코드로 옮긴다", () => {
    expect(claimErrorOf({ kind: "locked" })).toMatchObject({
      status: 409,
      code: "REPORT_LOCKED",
    });
    const order = claimErrorOf({ kind: "order", currentStep: 3 });
    expect(order).toMatchObject({ status: 409, code: "STEP_ORDER" });
    expect(order.message).toContain("3");
    expect(claimErrorOf({ kind: "running" })).toMatchObject({
      status: 409,
      code: "STEP_RUNNING",
    });
    expect(claimErrorOf({ kind: "exhausted", attempts: 10 })).toMatchObject({
      status: 409,
      code: "ATTEMPTS_EXHAUSTED",
    });
  });
});

describe("failureErrorOf", () => {
  it.each([
    ["validation", 422, "STEP_VALIDATION_FAILED"],
    ["upstream", 502, "MODEL_UPSTREAM_FAILED"],
    ["timeout", 504, "STEP_TIMEOUT"],
    ["fatal", 500, "STEP_FATAL"],
  ] as const)("%s", (failure, status, code) => {
    expect(failureErrorOf(failure)).toMatchObject({ status, code });
  });
});

describe("shouldTerminate", () => {
  const withAttempts = (attempts: number): StepState => ({
    steps: { 2: { ...emptyStepRecord(), status: "failed", attempts } },
  });

  it("fatal 이면 즉시 종결한다", () => {
    expect(shouldTerminate(withAttempts(1), 2, "fatal")).toBe(true);
  });
  it("시도 상한에 닿으면 종결한다", () => {
    expect(
      shouldTerminate(withAttempts(MAX_MODEL_ATTEMPTS_PER_STEP), 2, "upstream"),
    ).toBe(true);
  });
  it("상한 전이면 종결하지 않는다", () => {
    expect(shouldTerminate(withAttempts(1), 2, "validation")).toBe(false);
  });
});

describe("toStoredOutputs", () => {
  it("행의 산출 컬럼과 step_state.planDraft 를 뽑는다", () => {
    const draft = [{ title: "x" }];
    const out = toStoredOutputs({
      signals: { a: 1 },
      narrative_theme: "주제",
      grade_subthemes: [1],
      stage: "탐색",
      consistency: { c: 1 },
      axis_scores: [2],
      sections: [3],
      step_state: { steps: {}, planDraft: draft },
    });
    expect(out).toEqual({
      signals: { a: 1 },
      narrative_theme: "주제",
      grade_subthemes: [1],
      stage: "탐색",
      consistency: { c: 1 },
      axis_scores: [2],
      sections: [3],
      planDraft: draft,
    });
  });

  it("step_state 가 비어 있으면 planDraft 는 undefined 다", () => {
    const out = toStoredOutputs({
      signals: null,
      narrative_theme: null,
      grade_subthemes: null,
      stage: null,
      consistency: null,
      axis_scores: null,
      sections: null,
      step_state: {},
    });
    expect(out.planDraft).toBeUndefined();
  });
});

describe("callModelWith", () => {
  it("번들과 signal 을 callText 옵션으로 넘기고 응답을 돌려준다", async () => {
    const calls: unknown[][] = [];
    const callText = async (...args: unknown[]) => {
      calls.push(args);
      return "{}";
    };
    const schema = { type: "object" };
    const signal = new AbortController().signal;
    const out = await callModelWith(callText)(
      {
        system: "S",
        user: "U",
        responseSchema: schema as never,
        maxOutputTokens: 1234,
      },
      signal,
    );
    expect(out).toBe("{}");
    expect(calls[0]).toEqual([
      "S",
      "U",
      {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 1234,
        abortSignal: signal,
      },
    ]);
  });
});
