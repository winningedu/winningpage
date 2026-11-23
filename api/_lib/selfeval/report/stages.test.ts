import { describe, expect, it } from "vitest";
import type { GrowthSnapshot } from "../types.js";
import { diagnosisSource, goalSource, growthSource } from "./stages.js";

describe("diagnosisSource", () => {
  it("reads the first student headline line and the KST diagnosis date", () => {
    expect(
      diagnosisSource({
        diagnosed_at: "2026-03-04T05:00:00.000Z",
        payload: { headlineLines: ["함수 개념 이해는 양호함", "둘째 줄"] },
      }),
    ).toEqual({
      state: "ok",
      value: { sentence: "함수 개념 이해는 양호함", date: "2026.03.04" },
    });
  });

  it("is none when there is no report or no usable headline", () => {
    expect(diagnosisSource(null)).toEqual({ state: "none" });
    expect(
      diagnosisSource({
        diagnosed_at: "2026-03-04T05:00:00.000Z",
        payload: { headlineLines: [" ", 3] },
      }),
    ).toEqual({ state: "none" });
    expect(
      diagnosisSource({
        diagnosed_at: "2026-03-04T05:00:00.000Z",
        payload: null,
      }),
    ).toEqual({ state: "none" });
  });
});

describe("goalSource", () => {
  it("joins the ideal and minimum target like the console does", () => {
    expect(
      goalSource({
        ideal_university: "A대",
        ideal_department: "수학과",
        min_university: "B대",
        min_department: "",
      }),
    ).toEqual({
      state: "ok",
      value: { sentence: "이상 A대 수학과, 최소 B대" },
    });
  });

  it("is none when there is no row or both targets are empty", () => {
    expect(goalSource(null)).toEqual({ state: "none" });
    expect(
      goalSource({
        ideal_university: "",
        ideal_department: "",
        min_university: "",
        min_department: "",
      }),
    ).toEqual({ state: "none" });
  });
});

const snapshot = (over: Partial<GrowthSnapshot> = {}): GrowthSnapshot => ({
  reportId: "g1",
  issuedAt: "2026-02-01T00:00:00.000Z",
  narrativeTheme: null,
  gradeSubthemes: [
    { grade: "고1", stage: "seed", text: "함수와 경제" },
    { grade: "고2", stage: "flower", text: "통계" },
  ],
  stage: null,
  weakAxes: [],
  alignedSignals: [],
  conflictingSignals: [],
  planItems: [
    {
      id: "a",
      title: "수학 수행",
      description: null,
      axis: null,
      category: null,
    },
    {
      id: "b",
      title: "심화 탐구",
      description: null,
      axis: null,
      category: null,
    },
  ],
  ...over,
});

describe("growthSource", () => {
  it("shows the current grade subtheme and the plan item order in one line", () => {
    expect(growthSource(snapshot(), "고1")).toEqual({
      state: "ok",
      value: {
        sentence: "고1 소주제 함수와 경제, 실행계획 1. 수학 수행, 2. 심화 탐구",
      },
    });
  });

  it("shows only the subtheme when there are no plan items and never invents an order", () => {
    expect(growthSource(snapshot({ planItems: [] }), "고1")).toEqual({
      state: "ok",
      value: { sentence: "고1 소주제 함수와 경제" },
    });
  });

  it("is none without a snapshot, a grade or a matching subtheme", () => {
    expect(growthSource(null, "고1")).toEqual({ state: "none" });
    expect(growthSource(snapshot(), null)).toEqual({ state: "none" });
    expect(growthSource(snapshot(), "고3")).toEqual({ state: "none" });
  });
});
