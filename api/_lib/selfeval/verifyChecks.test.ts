import { describe, expect, it } from "vitest";
import { SCORE_RUBRIC } from "./dictionaries.js";
import type { ScoreCheck, ScoreItemKey } from "./types.js";
import {
  applyDeterministicChecks,
  growthSignalChecks,
} from "./verifyChecks.js";

function modelChecks(pass: boolean) {
  const out = {} as Record<ScoreItemKey, ScoreCheck[]>;
  for (const r of SCORE_RUBRIC)
    out[r.key] = r.checks.map((text) => ({ text, pass }));
  return out;
}

describe("applyDeterministicChecks", () => {
  it("핵심 낱말이 본문에 있으면 prompt 두 번째 확인을 true 로 덮어쓴다", () => {
    const r = applyDeterministicChecks(modelChecks(false), {
      text: "계수 변화를 탐구한 과정을 적었다.",
      promptKeywords: ["탐구", "갈등"],
    });
    expect(r.prompt[1]?.pass).toBe(true);
    expect(r.prompt[0]?.pass).toBe(false);
  });

  it("하나도 없으면 false 로 덮어쓴다", () => {
    const r = applyDeterministicChecks(modelChecks(true), {
      text: "계수 변화를 적었다.",
      promptKeywords: ["갈등"],
    });
    expect(r.prompt[1]?.pass).toBe(false);
  });

  it("promptKeywords 가 비면 모델 판정을 유지하고 입력을 바꾸지 않는다", () => {
    const input = modelChecks(true);
    const r = applyDeterministicChecks(input, {
      text: "x",
      promptKeywords: [],
    });
    expect(r.prompt[1]?.pass).toBe(true);
    const flipped = applyDeterministicChecks(input, {
      text: "x",
      promptKeywords: ["y"],
    });
    expect(input.prompt[1]?.pass).toBe(true);
    expect(flipped.prompt[1]?.pass).toBe(false);
  });
});

describe("growthSignalChecks", () => {
  const weak = (axis: "A" | "C", guideline: string) => ({
    axis,
    name: axis === "A" ? "학업역량" : "탐구 및 자기주도성",
    count: 1,
    required: 2,
    guideline,
  });

  it("가이드라인 낱말이 본문에 있으면 satisfied 다", () => {
    const r = growthSignalChecks("직접 실험을 설계해 비교했다.", {
      alignedSignals: [],
      weakAxes: [
        weak("C", "실험 설계 과정을 드러낸다"),
        weak("A", "심화 개념을 다룬다"),
      ],
    });
    expect(r).toEqual([
      {
        axis: "C",
        name: "탐구 및 자기주도성",
        satisfied: true,
        current: 1,
        required: 2,
        guideline: "실험 설계 과정을 드러낸다",
      },
      {
        axis: "A",
        name: "학업역량",
        satisfied: false,
        current: 1,
        required: 2,
        guideline: "심화 개념을 다룬다",
      },
    ]);
  });

  it("부족 축이 없으면 빈 배열이다", () => {
    expect(
      growthSignalChecks("x", { alignedSignals: [], weakAxes: [] }),
    ).toEqual([]);
  });
});
