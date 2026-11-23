// Valid answer sets for engine tests. CALC_EXAMPLE follows the 기능요구명세서
// 계산 예시 sheet (고1, diagnosed 2026-11-09); values the sheet leaves open
// (q5, q21, q15 keys, admission year) are picked here and marked.

import type { TrackCode } from "./codes.js";
import type { Likert } from "./likert.js";
import type { DiagnosisV3Answers, DiagnosisV3Context } from "./types.js";

const L = (...values: Likert[]) => values;

export const CALC_EXAMPLE: DiagnosisV3Answers = {
  q1: 3, // 고등학교 1학년
  q2: 2, // 자율형 사립고
  q3: 1, // 목표 대학과 학과가 모두 정해져 있어요
  q3Target: { university: "연세대학교", major: "경영학과" },
  q4: 2, // 5등급제
  q5: 2, // not in the sheet: 학교에서 제공한 평균 내신
  q6: 1.4,
  // 계산 예시 A3-A9 and A11 (V1 별로)
  q9: {
    items: L(3, 3, 3, 3, 2, 2, 3, 2, 1, 2, 3, 2, 2, 2, 3),
    verify: 1,
  },
  // 계산 예시 A15-A17 (3 별로, 5 대체로 before reversal), V3 보통
  q20: { items: L(3, 3, 1, 2, 3, 2), verify: 2 },
  // 계산 예시 A5, A7, A17: one check each for 계획 수립, 활동 기록, 불안 회복
  q10: [3, 7, 13],
  // 계산 예시 A18-A23, V2 별로
  q11: { items: L(3, 2, 2, 2, 1, 2, 2, 2, 3, 2, 2, 2), verify: 1 },
  // 계산 예시 A20 (탐구 심화 2 checks), A23 (입시 전략 1 check)
  q12: [5, 6, 11],
  // 계산 예시 A28: 수행평가 Day 19, 기말고사 Day 32
  q13: [
    { kind: "PERF", date: "2026-11-27" },
    { kind: "EXAM", date: "2026-12-10" },
  ],
  q21: { weekday: 3, weekend: 2 }, // not in the sheet
  q14: [2, 6], // 계산 예시 A27
  // 계산 예시 A29: 연세대 경영 학생부교과(추천형); keys are placeholders
  q15: {
    universityKey: "yonsei",
    departmentKey: "business",
    mainTrack: "교과",
    admissionTrack: "추천형",
    subjectReflection: null,
  },
  q16: 4, // 목표 전형에 수능 최저가 없어요
  q17: 3, // 성적은 괜찮지만 탐구 활동이 부족해요
  q18: 6, // 아직 해당 없음 (고1)
  // 계산 예시 A30: NS 70, HA 65, RD 60, PS 45, SD 55, CO 70, ST 55
  q23: {
    items: L(
      ...L(4, 3, 3, 2, 2),
      ...L(3, 3, 2, 3, 2),
      ...L(3, 2, 2, 3, 2),
      ...L(2, 2, 1, 2, 2),
      ...L(2, 3, 2, 2, 2),
      ...L(3, 3, 3, 3, 2),
      ...L(2, 3, 2, 2, 2),
    ),
    verify: 3,
  },
};

export const CALC_EXAMPLE_CONTEXT: DiagnosisV3Context = {
  diagnosedAt: "2026-11-09",
  joinedAt: null,
  // 계산 예시 A29: 70%컷 1.28, no 50%컷, 경쟁률 correction 0; year picked
  admission: {
    cut50: null,
    cut70: 1.28,
    competitionRate: null,
    universityName: "연세대학교",
    unitName: "경영학과",
    typeName: "학생부교과(추천형)",
    year: 2026,
  },
  studentName: null,
};

/** A full valid answer set for each track, built on CALC_EXAMPLE. */
export function validAnswers(track: TrackCode): DiagnosisV3Answers {
  if (track === "H12") return CALC_EXAMPLE;
  if (track === "H3") return { ...CALC_EXAMPLE, q1: 5, q12: [1], q18: 2 };
  const { q15: _q15, q16: _q16, q17: _q17, q18: _q18, ...rest } = CALC_EXAMPLE;
  return { ...rest, q1: 2, q2: 7, q4: 3, q12: [7] };
}
