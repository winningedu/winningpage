import { describe, expect, test } from "vitest";
import {
  admissionCutValue,
  normalizeDepartmentKey,
  normalizeUniversityKey,
} from "./admissionCut.js";

describe("admissionCutValue", () => {
  test("일반 전형은 grade_50 을 쓴다", () => {
    expect(
      admissionCutValue({
        grade_50: 2.1,
        grade_70: 2.5,
        screening_category: "일반",
      }),
    ).toBe(2.1);
  });

  test("grade_50 이 없으면 grade_70 으로 대체한다", () => {
    expect(
      admissionCutValue({
        grade_50: null,
        grade_70: 2.5,
        screening_category: "추천형",
      }),
    ).toBe(2.5);
  });

  test("둘 다 없으면 null", () => {
    expect(
      admissionCutValue({
        grade_50: null,
        grade_70: null,
        screening_category: "일반",
      }),
    ).toBeNull();
  });

  test("일반, 추천형이 아닌 전형은 값이 있어도 제외한다", () => {
    for (const category of ["지역인재", "농어촌", "기회균형", null]) {
      expect(
        admissionCutValue({
          grade_50: 2.1,
          grade_70: 2.5,
          screening_category: category,
        }),
      ).toBeNull();
    }
  });
});

describe("normalizeUniversityKey", () => {
  test("끝의 대학교를 대로 줄인다", () => {
    expect(normalizeUniversityKey("고려대학교")).toBe("고려대");
  });

  test("괄호 캠퍼스는 보존한다", () => {
    expect(normalizeUniversityKey("한양대학교(ERICA)")).toBe("한양대(ERICA)");
    expect(normalizeUniversityKey("고려대학교(세종)")).toBe("고려대(세종)");
  });

  test("공백을 모두 지운다", () => {
    expect(normalizeUniversityKey(" 서울 대학교 ")).toBe("서울대");
    expect(normalizeUniversityKey("한양대 (ERICA)")).toBe("한양대(ERICA)");
  });

  test("이미 줄인 이름은 그대로 둔다", () => {
    expect(normalizeUniversityKey("고려대")).toBe("고려대");
  });
});

describe("normalizeDepartmentKey", () => {
  test("공백을 지운다", () => {
    expect(normalizeDepartmentKey(" 컴퓨터 공학과 ")).toBe("컴퓨터공학과");
  });
});
