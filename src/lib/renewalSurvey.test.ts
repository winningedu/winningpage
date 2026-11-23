import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/diagnosis-v3";
import {
  CALC_EXAMPLE,
  CALC_EXAMPLE_CONTEXT,
} from "@/lib/diagnosis-v3/testFixtures";
import type { LikertBlock } from "@/lib/diagnosis-v3/types";
import {
  showsQ3Target,
  toSubmitAnswers,
  visibleQuestionIds,
} from "./renewalSurvey";

/** UI likert map ("1".."n" and "V") of a v3 block. */
const likertMap = (block: LikertBlock) => ({
  ...Object.fromEntries(block.items.map((value, i) => [String(i + 1), value])),
  V: block.verify,
});

/** The survey state that answers CALC_EXAMPLE on screen. */
const calcDraft = {
  ...CALC_EXAMPLE,
  q6: "1.4",
  q9: likertMap(CALC_EXAMPLE.q9),
  q20: likertMap(CALC_EXAMPLE.q20),
  q11: likertMap(CALC_EXAMPLE.q11),
  q23: likertMap(CALC_EXAMPLE.q23),
  q15: {
    university: "연세대",
    department: "경영학과",
    admissionType: "교과",
    detailType: "추천형",
  },
};

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

describe("v3 제출 답안", () => {
  it("화면 응답을 계약 답안 형태로 바꾸고 validateAnswers를 통과한다", () => {
    const answers = toSubmitAnswers(calcDraft, CALC_EXAMPLE.q15 ?? null);
    expect(answers).toEqual(CALC_EXAMPLE);
    expect(validateAnswers(answers, CALC_EXAMPLE_CONTEXT.diagnosedAt).ok).toBe(
      true,
    );
  });

  it("숨겨진 문항과 비운 선택 입력은 보내지 않는다", () => {
    const answers = toSubmitAnswers(
      {
        ...calcDraft,
        q1: 2,
        q3: 6,
        q6s: { KOR: "2", MATH: "" },
        q6r: "",
        q6m: { month: 6, grades: { KOR: "3" } },
        q8: 6,
        q8s: 2,
        q8d: 1,
        q14: [],
        q13: [],
      },
      null,
    );
    for (const id of [
      "q3r",
      "q3Target",
      "q6s",
      "q6r",
      "q6m",
      "q8s",
      "q8d",
      "q14",
      "q13",
      "q15",
      "q16",
      "q17",
      "q18",
    ]) {
      expect(answers).not.toHaveProperty(id);
    }
    expect(answers.q8).toBe(6);
  });

  it("과목별 성적과 모의고사는 채운 칸만 숫자로 보낸다", () => {
    const answers = toSubmitAnswers(
      {
        ...calcDraft,
        q6s: { KOR: "2", MATH: "" },
        q6r: "2.5",
        q6m: { month: 6, grades: { KOR: "3", HIST: "" } },
      },
      CALC_EXAMPLE.q15 ?? null,
    );
    expect(answers.q6s).toEqual({ KOR: 2 });
    expect(answers.q6r).toBe(2.5);
    expect(answers.q6m).toEqual({ month: 6, grades: { KOR: 3 } });
  });
});
