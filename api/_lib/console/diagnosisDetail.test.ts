// W9a 학습진단 상세 창의 내용(지표 세 칸, 요약 문장, 12개 영역 줄, 우선순위 표).

import { describe, expect, test } from "vitest";
import type { AreaScores } from "./coaching.js";
import type { DiagnosisMeta } from "./coachingData.js";
import { diagnosisDetail } from "./diagnosisDetail.js";

const AREAS: AreaScores = {
  GOAL: 64,
  PLAN: 60,
  EXEC: 62,
  TIME: 61,
  FEEDBACK: 63,
  STABILITY: 62,
  SUBJECT: 74,
  INQUIRY: 62,
  RECORD: 70,
  PERFORM: 78,
  STRATEGY: 66,
  ACTIVITY: 76,
};
const flat = (execution: number, readiness: number): AreaScores => ({
  GOAL: execution,
  PLAN: execution,
  EXEC: execution,
  TIME: execution,
  FEEDBACK: execution,
  STABILITY: execution,
  SUBJECT: readiness,
  INQUIRY: readiness,
  RECORD: readiness,
  PERFORM: readiness,
  STRATEGY: readiness,
  ACTIVITY: readiness,
});
const META: DiagnosisMeta = {
  schoolType: "일반고",
  gpa: "2.60등급(5등급제)",
  gradeTrend: "상승",
  diagnosedAt: "2026.03.10",
};

describe("diagnosisDetail metrics", () => {
  test("two averages carry the previous diagnosis as sub text", () => {
    const d = diagnosisDetail(AREAS, flat(58, 69), META);
    expect(d.metrics[0]).toEqual({
      label: "학습 실행 역량(6영역 평균)",
      value: "62점",
      sub: "직전 진단 58점",
    });
    expect(d.metrics[1]).toEqual({
      label: "학교생활 준비도",
      value: "71점",
      sub: "직전 진단 69점",
    });
  });
});
