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

  test("with one report there is no previous diagnosis text", () => {
    const d = diagnosisDetail(AREAS, null, META);
    expect(d.metrics[0]).not.toHaveProperty("sub");
    expect(d.metrics[1]).not.toHaveProperty("sub");
  });

  test("urgency block counts the areas under 40 across all 12", () => {
    const none = diagnosisDetail(AREAS, null, META).metrics[2];
    expect(none).toEqual({
      label: "학습진단 긴급도",
      value: "보통",
      sub: "40점 미만 영역 0개",
    });
    const one = diagnosisDetail({ ...AREAS, RECORD: 38 }, null, META)
      .metrics[2];
    expect(one).toEqual({
      label: "학습진단 긴급도",
      value: "매우 높음",
      sub: "40점 미만 영역 1개",
    });
  });
});

describe("diagnosisDetail summary", () => {
  test("joins the report facts and the most urgent execution area", () => {
    expect(diagnosisDetail(AREAS, null, META).summary).toBe(
      "학교 유형 일반고, 전체 평균 내신 2.60등급(5등급제), 성적 흐름 상승, 진단일 2026.03.10. 가장 시급한 영역 계획 설계 60점, 목표까지 15점",
    );
  });

  test("leaves out the pieces the report did not fill", () => {
    const meta = { ...META, gpa: null, schoolType: null };
    expect(diagnosisDetail(AREAS, null, meta).summary).toBe(
      "성적 흐름 상승, 진단일 2026.03.10. 가장 시급한 영역 계획 설계 60점, 목표까지 15점",
    );
    expect(diagnosisDetail(AREAS, null, null).summary).toBe(
      "가장 시급한 영역 계획 설계 60점, 목표까지 15점",
    );
  });

  test("drops the target clause when the weakest area is 75 or more", () => {
    expect(diagnosisDetail(flat(80, 80), null, null).summary).toBe(
      "가장 시급한 영역 목표 설정 80점",
    );
  });
});
