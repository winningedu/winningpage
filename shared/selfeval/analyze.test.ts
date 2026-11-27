import { describe, expect, test } from "vitest";
import { analyzeBody, analyzeRunResponse } from "./analyze.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("analyzeBody", () => {
  test("run 은 sessionId 만 있으면 된다", () => {
    expect(analyzeBody.parse({ sessionId: SID, action: "run" })).toEqual({
      sessionId: SID,
      action: "run",
    });
  });

  test("sessionId 형식이 틀리거나 action 을 모르면 거절한다", () => {
    expect(
      analyzeBody.safeParse({ sessionId: "x", action: "run" }).success,
    ).toBe(false);
    expect(
      analyzeBody.safeParse({ sessionId: SID, action: "zzz" }).success,
    ).toBe(false);
    expect(analyzeBody.safeParse(null).success).toBe(false);
  });

  test("save 는 알려진 항목의 문자열 edits 만 받는다", () => {
    const save = (edits: unknown) =>
      analyzeBody.safeParse({ sessionId: SID, action: "save", edits }).success;
    expect(save({ method: "a" })).toBe(true);
    expect(save({ nope: "a" })).toBe(false);
    expect(save({ method: 1 })).toBe(false);
    expect(save(undefined)).toBe(false);
  });

  test("resolve-conflict 는 0 이상 정수 index 와 a 또는 b 를 받는다", () => {
    const resolve = (index: unknown, choice: unknown) =>
      analyzeBody.safeParse({
        sessionId: SID,
        action: "resolve-conflict",
        index,
        choice,
      }).success;
    expect(resolve(0, "a")).toBe(true);
    expect(resolve(-1, "a")).toBe(false);
    expect(resolve(0.5, "a")).toBe(false);
    expect(resolve(0, "c")).toBe(false);
  });
});

describe("analyzeRunResponse", () => {
  test("ok 필드 없이 분석, 충돌, 출처, 단계, 시도 수를 읽는다", () => {
    const values = Object.fromEntries(
      [
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
      ].map((k) => [k, "v"]),
    );
    const sources = Object.fromEntries(
      Object.keys(values).map((k) => [k, "record"]),
    );
    const analysis = { values, sources, conflicts: [] };
    const parsed = analyzeRunResponse.parse({
      analysis,
      conflicts: [],
      analysisSource: "model",
      currentStep: 3,
      attempts: 1,
      softIssues: [],
    });
    expect(parsed.analysisSource).toBe("model");
    expect(analyzeRunResponse.safeParse({ analysis }).success).toBe(false);
  });
});
