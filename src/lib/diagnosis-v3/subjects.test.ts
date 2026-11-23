import { describe, expect, test } from "vitest";
import { OPTIONS } from "./options.js";
import { COPY_TEXT } from "./source/copyText.js";
import { judgeSubjects, SUBJECT_CODES, subjectTextId } from "./subjects.js";
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

  test("with mock: both lowest PRIORITY, one side CHECK, both 1등급 STRENGTH", () => {
    expect(
      judgeSubjects({
        ...PDF_STUDENT,
        q8d: 1, // 올랐어요: no down rule
        q6s: { KOR: 1.0, MATH: 3.0, ENG: 2.0, SOC: 2.0, SCI: 3.0 },
        q6m: { month: 9, grades: { KOR: 1, MATH: 4, ENG: 4, SOC: 2 } },
      }),
    ).toEqual({
      KOR: "STRENGTH",
      MATH: "PRIORITY",
      ENG: "CHECK",
      SOC: "KEEP",
      SCI: "CHECK",
    });
  });

  test("all grades equal means no lowest; 한국사 mock is not judged", () => {
    expect(
      judgeSubjects({
        ...PDF_STUDENT,
        q8d: 3,
        q6s: { KOR: 2, MATH: 2 },
        q6m: { month: 6, grades: { KOR: 3, MATH: 3, HIST: 9 } },
      }),
    ).toEqual({ KOR: "KEEP", MATH: "KEEP" });
  });

  test("22 r45: no q6s skips the verdicts", () => {
    const { q6s: _q6s, ...rest } = PDF_STUDENT;
    expect(judgeSubjects(rest)).toBeNull();
    expect(judgeSubjects({ ...PDF_STUDENT, q6s: {} })).toBeNull();
  });

  test("PDF p3 text ids: SUBJ_J1_ without mock, SUBJ_J_ with mock", () => {
    expect(COPY_TEXT[subjectTextId(PDF_STUDENT, "MATH", "CHECK")]).toBe(
      "입력한 과목 중 내신이 가장 낮거나 내려가는 중입니다. 오답 원인을 확인합니다.",
    );
    expect(COPY_TEXT[subjectTextId(PDF_STUDENT, "KOR", "STRENGTH")]).toBe(
      "내신에서 최상위입니다. 현재 방식을 유지합니다.",
    );
    const withMock = {
      ...PDF_STUDENT,
      q6m: { month: 9, grades: { KOR: 1 } },
    };
    expect(subjectTextId(withMock, "KOR", "STRENGTH")).toBe("SUBJ_J_강점");
    expect(subjectTextId(withMock, "MATH", "KEEP")).toBe("SUBJ_J1_유지");
  });

  test("q8s ordinals 1..5 follow the 13 F12 subject order", () => {
    expect(
      OPTIONS.q8s.slice(0, SUBJECT_CODES.length).map((o) => o.label[0]),
    ).toEqual(["국", "수", "영", "사", "과"]);
  });
});
