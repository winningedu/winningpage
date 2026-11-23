import { describe, expect, test } from "vitest";
import { gradeBoundsOf } from "@/lib/diagnosis-v3/validate";
import { gradeRule } from "./GradeFields";

describe("gradeRule input bounds mirror validateAnswers (review W3)", () => {
  test.each([1, 2, 3, 4, undefined])("q4 %s", (q4) => {
    const { min, max } = gradeBoundsOf(q4);
    expect(gradeRule(q4)).toMatchObject({ min, max });
  });

  test("성취평가제 is bounded to 0..100, not open", () => {
    expect(gradeRule(3)).toMatchObject({ min: 0, max: 100 });
  });
});
