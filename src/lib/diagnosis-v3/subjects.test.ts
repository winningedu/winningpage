import { describe, expect, test } from "vitest";
import { judgeSubjects } from "./subjects.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";

// PDF p3 (고2): 내신 국어 1.0, 수학 1.5, 영어 1.5, 사회 1.25, no mock,
// 7번 과목마다 오르내림 (5), 7-1 수학 (2), 7-2 내려갔어요 (2).
const PDF_STUDENT: DiagnosisV3Answers = {
  ...CALC_EXAMPLE,
  q1: 4,
  q6: 1.25,
  q6s: { KOR: 1.0, MATH: 1.5, ENG: 1.5, SOC: 1.25 },
  q8: 5,
  q8s: 2,
  q8d: 2,
};

describe("judgeSubjects (22 r44)", () => {
  test("PDF p3: 국어 강점, 수학 점검, 영어 점검, 사회 유지 without mock", () => {
    expect(judgeSubjects(PDF_STUDENT)).toEqual({
      KOR: "STRENGTH",
      MATH: "CHECK",
      ENG: "CHECK",
      SOC: "KEEP",
    });
  });
});
