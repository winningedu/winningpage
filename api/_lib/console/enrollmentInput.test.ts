// 학적 입력 검증 상수와 판정. 학급 직접 수정, 스스로 배정, 변경 신청 라우트가 함께 쓴다.

import { describe, expect, test } from "vitest";
import {
  ENROLLMENT_GRADES,
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "./enrollmentInput.js";

describe("enrollment input", () => {
  test("grades are middle 1 to high 3 in order", () => {
    expect(ENROLLMENT_GRADES).toEqual([
      "중1",
      "중2",
      "중3",
      "고1",
      "고2",
      "고3",
    ]);
  });

  test.each(["중1", "고3"])("%s is a grade", (value) => {
    expect(isEnrollmentGrade(value)).toBe(true);
  });

  test.each(["고4", "", null, 1])("%s is not a grade", (value) => {
    expect(isEnrollmentGrade(value)).toBe(false);
  });

  test.each([1, 99])("%i is a valid number", (value) => {
    expect(isEnrollmentNumber(value)).toBe(true);
  });

  test.each([0, 100, 1.5, "7", null])("%s is not a valid number", (value) => {
    expect(isEnrollmentNumber(value)).toBe(false);
  });
});
