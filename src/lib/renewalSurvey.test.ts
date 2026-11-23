import { describe, expect, it } from "vitest";
import { showsQ3Target, visibleQuestionIds } from "./renewalSurvey";

const H12 = { q1: 3 };
const M3 = { q1: 2 };

describe("v3 조건부 노출", () => {
  it("3번이 목표 없음이면 3-1을 숨기고, 1~3번이면 목표 입력을 연다", () => {
    expect(visibleQuestionIds(1, { ...H12, q3: 6 })).toEqual([
      "q1",
      "q2",
      "q3",
    ]);
    expect(visibleQuestionIds(1, { ...H12, q3: 4 })).toContain("q3r");
    expect(showsQ3Target({ ...H12, q3: 1 })).toBe(true);
    expect(showsQ3Target({ ...H12, q3: 3 })).toBe(true);
    expect(showsQ3Target({ ...H12, q3: 4 })).toBe(false);
    expect(showsQ3Target(H12)).toBe(false);
  });

  it("중3 트랙은 과목별 성적과 16번 목표 대학을 숨긴다", () => {
    expect(visibleQuestionIds(2, M3)).toEqual(["q4", "q5", "q6", "q8"]);
    expect(visibleQuestionIds(2, H12)).toEqual([
      "q4",
      "q5",
      "q6",
      "q6s",
      "q6r",
      "q6m",
      "q8",
    ]);
    expect(visibleQuestionIds(5, M3)).toEqual([]);
  });

  it("7번에 답해야 7-1이, 7-1이 모르겠어요가 아니어야 7-2가 열린다", () => {
    expect(visibleQuestionIds(2, { ...M3, q8: 6 })).not.toContain("q8s");
    expect(visibleQuestionIds(2, { ...M3, q8: 1 })).toContain("q8s");
    expect(visibleQuestionIds(2, { ...M3, q8: 1, q8s: 7 })).not.toContain(
      "q8d",
    );
    expect(visibleQuestionIds(2, { ...M3, q8: 1, q8s: 2 })).toContain("q8d");
  });

  it("17~19번은 16번 4단 선택을 마쳐야 열린다", () => {
    expect(visibleQuestionIds(5, H12)).toEqual(["q15"]);
    expect(
      visibleQuestionIds(5, {
        ...H12,
        q15: { university: "연세대", department: "경영학과" },
      }),
    ).toEqual(["q15"]);
    expect(
      visibleQuestionIds(5, {
        ...H12,
        q15: {
          university: "연세대",
          department: "경영학과",
          admissionType: "교과",
          detailType: "추천형",
        },
      }),
    ).toEqual(["q15", "q16", "q17", "q18"]);
  });
});
