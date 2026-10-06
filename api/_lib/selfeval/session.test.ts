import { describe, expect, it } from "vitest";
import {
  currentAcademicYear,
  emptyStepRecord,
  guardStep,
  interpretClaim,
  isExhausted,
  isGrowthStale,
  isSessionExpired,
  parseStepState,
  progress,
  routeForStep,
  stepRecord,
} from "./session.js";

describe("currentAcademicYear", () => {
  it("한국 시간 3월 1일부터 새 학년도이고 2월까지는 전년도다", () => {
    expect(currentAcademicYear(new Date("2026-02-28T14:59:59Z"))).toBe(2025);
    // UTC 2월 28일 15:00 은 KST 3월 1일 0시
    expect(currentAcademicYear(new Date("2026-02-28T15:00:00Z"))).toBe(2026);
    expect(currentAcademicYear(new Date("2026-10-06T00:00:00Z"))).toBe(2026);
    expect(currentAcademicYear(new Date("2027-01-15T00:00:00Z"))).toBe(2026);
  });
});

describe("만료 판정", () => {
  const now = new Date("2026-10-06T03:00:00Z"); // KST 10월 6일 낮
  it("마지막 활동 후 90일째 당일부터 만료다", () => {
    // 한국 날짜로 7월 8일은 정확히 90일 전이다
    expect(isSessionExpired("2026-07-08T12:00:00Z", now)).toBe(true);
  });

  it("89일 전은 유효하고 90일 전 날짜부터 만료다", () => {
    expect(isSessionExpired("2026-07-09T00:00:00Z", now)).toBe(false);
    expect(isSessionExpired("2026-07-06T20:00:00Z", now)).toBe(true);
  });

  it("성장설계는 발급 후 180일째 당일부터 오래된 것으로 본다", () => {
    expect(isGrowthStale("2026-04-10T00:00:00Z", now)).toBe(false);
    expect(isGrowthStale("2026-04-09T00:00:00Z", now)).toBe(true);
    expect(isGrowthStale("2026-04-05T00:00:00Z", now)).toBe(true);
  });
});

describe("guardStep", () => {
  it.each([
    [0, "pick", false],
    [1, "pick", true],
    [6, "pick", true],
    [1, "analyze", false],
    [3, "analyze", true],
    [5, "write", true],
    [6, "verify", true],
    [3, "verify", false],
    [2, "analyze", true],
    [2, "write", false],
    [3, "write", true],
    [3, "verify", false],
    [4, "verify", true],
    [4, "finalize", false],
    [5, "finalize", true],
  ] as const)("단계 %s 에서 %s 는 허용 %s", (step, action, ok) => {
    const r = guardStep(step, action);
    expect(r.ok).toBe(ok);
  });

  it("막히면 필요한 단계를 알려 준다", () => {
    expect(guardStep(1, "analyze")).toEqual({
      ok: false,
      code: "STEP_ORDER",
      requiredStep: 2,
    });
  });
});

describe("step_state", () => {
  it("이상한 값은 빈 상태로 정규화한다", () => {
    expect(parseStepState(null)).toEqual({ steps: {} });
    expect(parseStepState("x")).toEqual({ steps: {} });
    expect(parseStepState([])).toEqual({ steps: {} });
  });

  it("모델 단계 키만 받고 필드를 보정한다", () => {
    const s = parseStepState({
      steps: {
        analyze: {
          status: "ok",
          attempts: 2,
          finishedAt: "2026-10-06T00:00:00Z",
        },
        write: { status: "weird", attempts: -1, issues: "no" },
        bogus: { status: "ok" },
      },
      terminal: { reason: "r", at: "t", step: "write" },
    });
    expect(Object.keys(s.steps)).toEqual(["analyze", "write"]);
    expect(s.steps.analyze).toMatchObject({
      status: "ok",
      attempts: 2,
      startedAt: null,
    });
    expect(s.steps.write).toEqual(emptyStepRecord());
    expect(s.terminal).toEqual({ reason: "r", at: "t", step: "write" });
  });

  it("기록이 없는 단계는 빈 기록을 돌려준다", () => {
    expect(stepRecord({ steps: {} }, "verify")).toEqual(emptyStepRecord());
  });

  it("시도 10회부터 소진이다", () => {
    expect(isExhausted({ ...emptyStepRecord(), attempts: 9 })).toBe(false);
    expect(isExhausted({ ...emptyStepRecord(), attempts: 10 })).toBe(true);
  });

  it("진행 표시는 분석, 생성, 검증 순서다", () => {
    const p = progress({
      steps: { analyze: { ...emptyStepRecord(), status: "ok", attempts: 1 } },
    });
    expect(p).toEqual([
      { step: "analyze", label: "분석", status: "ok", attempts: 1 },
      { step: "write", label: "생성", status: "pending", attempts: 0 },
      { step: "verify", label: "검증", status: "pending", attempts: 0 },
    ]);
  });
});

describe("interpretClaim", () => {
  it("선점 결과 jsonb 를 정규화한다", () => {
    expect(interpretClaim({ kind: "claimed", attempts: 1 })).toEqual({
      kind: "claimed",
      attempts: 1,
    });
    expect(interpretClaim({ kind: "exhausted", attempts: 10 })).toEqual({
      kind: "exhausted",
      attempts: 10,
    });
    expect(interpretClaim({ kind: "order", currentStep: 2 })).toEqual({
      kind: "order",
      currentStep: 2,
    });
    expect(interpretClaim({ kind: "locked" })).toEqual({ kind: "locked" });
    expect(interpretClaim({ kind: "running" })).toEqual({ kind: "running" });
  });

  it("해석할 수 없으면 던진다", () => {
    expect(() => interpretClaim(null)).toThrow();
    expect(() => interpretClaim({ kind: "claimed" })).toThrow();
    expect(() => interpretClaim({ kind: "nope" })).toThrow();
  });
});

describe("routeForStep", () => {
  it.each([
    [0, "new"],
    [1, "activities"],
    [2, "analysis"],
    [3, "analysis"],
    [4, "result"],
    [5, "verify"],
    [6, "done"],
  ] as const)("단계 %s 는 %s", (step, route) => {
    expect(routeForStep(step)).toBe(route);
  });
});
