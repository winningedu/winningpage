import { describe, expect, it } from "vitest";
import { MAX_MODEL_ATTEMPTS_PER_STEP } from "../validation.js";
import {
  emptyStepRecord,
  interpretClaim,
  isExhausted,
  nextStep,
  parseStepState,
  progress,
  stepRecord,
  terminalReasonFor,
} from "./stepState.js";
import { STEP_LABELS, type StepNumber, type StepState } from "./types.js";

function okThrough(...steps: number[]): StepState {
  const state: StepState = { steps: {} };
  for (const n of steps)
    state.steps[n as StepNumber] = { ...emptyStepRecord(), status: "ok" };
  return state;
}

describe("parseStepState", () => {
  it("객체가 아니면 빈 상태를 돌려준다", () => {
    for (const raw of [null, undefined, 3, "x", []]) {
      expect(parseStepState(raw)).toEqual({ steps: {} });
    }
  });

  it("누락 필드를 빈 레코드 값으로 채운다", () => {
    const s = parseStepState({ steps: { "2": { status: "ok" } } });
    expect(s.steps[2]).toEqual({ ...emptyStepRecord(), status: "ok" });
  });

  it("1~8 밖의 키는 버린다", () => {
    const s = parseStepState({ steps: { "0": {}, "9": {}, a: {}, "3": {} } });
    expect(Object.keys(s.steps)).toEqual(["3"]);
  });

  it("잘못된 status, attempts, issues 는 보정한다", () => {
    const s = parseStepState({
      steps: {
        "1": { status: "weird", attempts: -2, issues: "x" },
        "2": { attempts: "3" },
        "3": { attempts: 4, issues: [{ code: "a", message: "m" }] },
      },
    });
    expect(s.steps[1]).toEqual(emptyStepRecord());
    expect(s.steps[2]?.attempts).toBe(0);
    expect(s.steps[3]?.attempts).toBe(4);
    expect(s.steps[3]?.issues).toHaveLength(1);
  });

  it("레코드가 객체가 아니면 빈 레코드로 본다", () => {
    expect(parseStepState({ steps: { "1": null } }).steps[1]).toEqual(
      emptyStepRecord(),
    );
  });

  it("planDraft 는 배열일 때만 유지한다", () => {
    expect(parseStepState({ planDraft: [{ a: 1 }] }).planDraft).toEqual([
      { a: 1 },
    ]);
    expect("planDraft" in parseStepState({ planDraft: "x" })).toBe(false);
  });

  it("terminal 은 모양이 맞을 때만 유지한다", () => {
    const t = { reason: "r", at: "2026-01-01T00:00:00Z", step: 6 };
    expect(parseStepState({ terminal: t }).terminal).toEqual(t);
    expect(
      parseStepState({ terminal: { ...t, step: 9 } }).terminal,
    ).toBeUndefined();
    expect(
      parseStepState({ terminal: { reason: "r" } }).terminal,
    ).toBeUndefined();
  });
});

describe("stepRecord", () => {
  it("누락이면 빈 레코드", () => {
    expect(stepRecord({ steps: {} }, 4)).toEqual(emptyStepRecord());
  });
});

describe("nextStep", () => {
  it("빈 상태는 1단계부터", () => {
    expect(nextStep({ steps: {} })).toBe(1);
  });

  it("연속으로 ok 인 다음 단계를 가리킨다", () => {
    expect(nextStep(okThrough(1, 2, 3))).toBe(4);
  });

  it("중간이 비면 거기서 멈춘다", () => {
    const s = okThrough(1, 3, 4);
    expect(nextStep(s)).toBe(2);
  });

  it("전부 ok 면 null 과 8", () => {
    const s = okThrough(1, 2, 3, 4, 5, 6, 7, 8);
    expect(nextStep(s)).toBeNull();
  });

  it("failed, running 은 ok 가 아니다", () => {
    const s = okThrough(1);
    s.steps[2] = { ...emptyStepRecord(), status: "failed" };
    expect(nextStep(s)).toBe(2);
  });
});

describe("isExhausted", () => {
  it("검증 상한과 연동된다", () => {
    const at = (attempts: number) => ({ ...emptyStepRecord(), attempts });
    expect(isExhausted(at(MAX_MODEL_ATTEMPTS_PER_STEP - 1))).toBe(false);
    expect(isExhausted(at(MAX_MODEL_ATTEMPTS_PER_STEP))).toBe(true);
  });
});

describe("progress", () => {
  it("8개 단계를 라벨과 함께 돌려준다", () => {
    const s = okThrough(1);
    s.steps[2] = { ...emptyStepRecord(), status: "running", attempts: 2 };
    const p = progress(s);
    expect(p).toHaveLength(8);
    expect(p[0]).toEqual({
      step: 1,
      label: STEP_LABELS[1],
      status: "ok",
      attempts: 0,
    });
    expect(p[1]).toMatchObject({ step: 2, status: "running", attempts: 2 });
    expect(p[7]).toEqual({
      step: 8,
      label: STEP_LABELS[8],
      status: "pending",
      attempts: 0,
    });
  });
});

describe("interpretClaim", () => {
  it("모든 kind 를 정규화한다", () => {
    expect(interpretClaim({ kind: "claimed", attempts: 3 })).toEqual({
      kind: "claimed",
      attempts: 3,
    });
    expect(interpretClaim({ kind: "done" })).toEqual({ kind: "done" });
    expect(interpretClaim({ kind: "locked" })).toEqual({ kind: "locked" });
    expect(interpretClaim({ kind: "running" })).toEqual({ kind: "running" });
    expect(interpretClaim({ kind: "order", currentStep: 2 })).toEqual({
      kind: "order",
      currentStep: 2,
    });
    expect(interpretClaim({ kind: "exhausted", attempts: 10 })).toEqual({
      kind: "exhausted",
      attempts: 10,
    });
  });

  it("모르는 kind 나 객체가 아닌 값은 던진다", () => {
    expect(() => interpretClaim({ kind: "zzz" })).toThrow(
      "선점 결과를 해석할 수 없습니다",
    );
    expect(() => interpretClaim(null)).toThrow(
      "선점 결과를 해석할 수 없습니다",
    );
    expect(() => interpretClaim("claimed")).toThrow(
      "선점 결과를 해석할 수 없습니다",
    );
  });

  it("숫자 필드가 없으면 던진다", () => {
    expect(() => interpretClaim({ kind: "claimed" })).toThrow(
      "선점 결과를 해석할 수 없습니다",
    );
    expect(() => interpretClaim({ kind: "order" })).toThrow(
      "선점 결과를 해석할 수 없습니다",
    );
  });
});

describe("terminalReasonFor", () => {
  it("운영 기록용 짧은 사유", () => {
    expect(terminalReasonFor("exhausted", 6)).toBe("6단계 시도 상한 초과");
    expect(terminalReasonFor("fatal", 6)).toBe("6단계 복구 불가 오류");
  });
});
