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

describe("diagnosisDetail areas", () => {
  test("12 rows, execution then readiness, with state and first step, target 75 only on execution", () => {
    const { bars } = diagnosisDetail(AREAS, null, META);
    expect(bars).toHaveLength(12);
    expect(bars[1]).toEqual({
      group: "execution",
      name: "계획 설계",
      score: 60,
      status: "보통",
      firstStep: "월간 계획을 주간, 일간으로 분해",
      target: 75,
    });
    expect(bars[6]).toEqual({
      group: "readiness",
      name: "교과 관리",
      score: 74,
      status: "양호",
      firstStep: "과목별 성적 추이 정리",
    });
    expect(bars.slice(0, 6).every((a) => a.target === 75)).toBe(true);
    expect(bars.slice(6).some((a) => "target" in a)).toBe(false);
  });
});

describe("diagnosisDetail priorities", () => {
  test("execution areas ascending by score, 1순위 to 4순위, 점검, 유지, ties in radar order", () => {
    const { priorities } = diagnosisDetail(AREAS, null, META);
    expect(priorities.heading).toBe("학습 실행 역량 우선순위");
    expect(priorities.columns).toEqual([
      "순위",
      "영역",
      "점수",
      "상태",
      "먼저 할 것",
    ]);
    expect(priorities.rows).toEqual([
      ["1순위", "계획 설계", "60점", "보통", "월간 계획을 주간, 일간으로 분해"],
      ["2순위", "시간 관리", "61점", "보통", "고정 일정 먼저 입력"],
      ["3순위", "실행 지속", "62점", "보통", "하루 최소 학습량 설정"],
      ["4순위", "학습 안정", "62점", "보통", "최소 학습량 유지"],
      [
        "점검",
        "학습 피드백",
        "63점",
        "보통",
        "오답 원인 4분류(개념, 적용, 실수, 시간 부족)",
      ],
      ["유지", "목표 설정", "64점", "보통", "목표 대학, 학과 조사"],
    ]);
  });
});
