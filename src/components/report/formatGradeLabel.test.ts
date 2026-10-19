import { describe, expect, it } from "vitest";
import { formatGradeLabel } from "./formatGradeLabel";

describe("formatGradeLabel", () => {
  it.each([
    ["고1", "고등학교 1학년"],
    ["고2", "고등학교 2학년"],
    ["고3", "고등학교 3학년"],
    ["중1", "중학교 1학년"],
    ["중2", "중학교 2학년"],
    ["중3", "중학교 3학년"],
  ])("%s 는 %s 로 바꾼다", (raw, expected) => {
    expect(formatGradeLabel(raw)).toBe(expected);
  });

  it.each(["고등학교 2학년", "중학생", "N수생", "졸업", "N수"])(
    "%s 처럼 다른 값은 그대로 둔다",
    (raw) => {
      expect(formatGradeLabel(raw)).toBe(raw);
    },
  );

  it("앞뒤 공백을 제거한다", () => {
    expect(formatGradeLabel(" 고1 ")).toBe("고등학교 1학년");
    expect(formatGradeLabel(" N수생 ")).toBe("N수생");
  });

  it.each([null, undefined, "", "   "])("%j 는 null 이다", (raw) => {
    expect(formatGradeLabel(raw)).toBeNull();
  });
});
