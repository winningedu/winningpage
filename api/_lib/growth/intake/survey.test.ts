// 성장설계 학생 조사 24문항 검증과 병합 테스트(명세 No.30, 35, 36, 142).
import { describe, expect, test } from "vitest";
import {
  countAnswered,
  isShortAnswer,
  mergeSurveyAnswers,
  pushUniversity,
  SURVEY_QUESTIONS,
  validateSurveyPatch,
} from "./survey.js";

describe("SURVEY_QUESTIONS", () => {
  test("24문항이며 군 5개가 4/7/5/4/4 개수로 나뉜다", () => {
    expect(SURVEY_QUESTIONS).toHaveLength(24);
    const counts = new Map<string, number>();
    for (const q of SURVEY_QUESTIONS)
      counts.set(q.group, (counts.get(q.group) ?? 0) + 1);
    expect([...counts.values()]).toEqual([4, 7, 5, 4, 4]);
    expect(SURVEY_QUESTIONS.map((q) => q.key)).toEqual(
      Array.from({ length: 24 }, (_, i) => `q${i + 1}`),
    );
  });
});

describe("validateSurveyPatch 구조", () => {
  test("객체가 아니면 실패한다", () => {
    for (const bad of [null, "x", 3, [], undefined]) {
      expect(validateSurveyPatch(bad).ok).toBe(false);
    }
  });

  test("모르는 키는 키 이름을 담아 실패한다", () => {
    const r = validateSurveyPatch({ q99: "a" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("q99");
  });

  test("빈 객체는 빈 patch 로 통과한다", () => {
    expect(validateSurveyPatch({})).toEqual({ ok: true, patch: {} });
  });
});

describe("validateSurveyPatch 값 형식", () => {
  const ok = (v: unknown) => validateSurveyPatch(v).ok;

  test("text 는 문자열이고 trim 후 2000자 이하여야 한다", () => {
    expect(ok({ q1: "답변" })).toBe(true);
    expect(ok({ q1: "가".repeat(2000) })).toBe(true);
    expect(ok({ q1: "가".repeat(2001) })).toBe(false);
    expect(ok({ q1: ` ${"가".repeat(2000)} ` })).toBe(true);
    expect(ok({ q1: 3 })).toBe(false);
  });

  test("choice 는 options 중 하나여야 한다", () => {
    expect(ok({ q3: "둘 다" })).toBe(true);
    expect(ok({ q3: "아무거나" })).toBe(false);
    expect(ok({ q3: ["둘 다"] })).toBe(false);
  });

  test("multi 는 options 부분집합이며 중복이 없어야 한다", () => {
    expect(ok({ q13: ["글쓰기와 비평", "설계와 만들기"] })).toBe(true);
    expect(ok({ q13: ["글쓰기와 비평", "글쓰기와 비평"] })).toBe(false);
    expect(ok({ q13: ["없는 항목"] })).toBe(false);
    expect(ok({ q13: "글쓰기와 비평" })).toBe(false);
  });

  test("department 는 name 이 비어 있지 않은 객체여야 한다", () => {
    expect(ok({ q10: { name: "국어국문학과", source: "manual" } })).toBe(true);
    expect(ok({ q10: { name: "  " } })).toBe(false);
    expect(ok({ q10: "국어국문학과" })).toBe(false);
    expect(ok({ q10: { name: "a", source: "etc" } })).toBe(false);
  });

  test("universities 는 길이 0~2 배열이며 각 원소는 name 이 있어야 한다", () => {
    expect(ok({ q11: [] })).toBe(true);
    expect(
      ok({ q11: [{ name: "가대" }, { name: "나대", custom: true }] }),
    ).toBe(true);
    expect(
      ok({ q11: [{ name: "가대" }, { name: "나대" }, { name: "다대" }] }),
    ).toBe(false);
    expect(ok({ q11: [{ name: "" }] })).toBe(false);
  });

  test("null 값은 비우기로 허용한다", () => {
    expect(validateSurveyPatch({ q1: null, q10: null })).toEqual({
      ok: true,
      patch: { q1: null, q10: null },
    });
  });
});

describe("mergeSurveyAnswers", () => {
  test("덮어쓰고 null 은 키를 삭제하며 입력은 바꾸지 않는다", () => {
    const current = { q1: "옛", q2: "유지", q13: ["글쓰기와 비평"] };
    const patch = { q1: "새", q2: null, q3: "혼자" };
    const snapshot = JSON.stringify([current, patch]);
    const merged = mergeSurveyAnswers(current, patch);
    expect(merged).toEqual({ q1: "새", q3: "혼자", q13: ["글쓰기와 비평"] });
    expect(JSON.stringify([current, patch])).toBe(snapshot);
    expect(merged).not.toBe(current);
  });

  test("current 가 객체가 아니면 빈 것으로 본다", () => {
    expect(mergeSurveyAnswers(null, { q1: "a" })).toEqual({ q1: "a" });
    expect(mergeSurveyAnswers("x", { q1: null })).toEqual({});
  });
});

describe("countAnswered", () => {
  test("시안 24문항 중 13문항 답함을 재현한다", () => {
    const answers = {
      q1: "가",
      q2: "나",
      q3: "혼자",
      q4: "함께",
      q5: "정해짐",
      q6: "다",
      q7: "라",
      q10: { name: "국문과" },
      q11: [{ name: "가대" }],
      q13: ["글쓰기와 비평"],
      q23: "모름",
      q24: "모름",
      q12: "마",
      // 답으로 세지 않는 값들
      q8: "   ",
      q9: "",
      q14: null,
      q15: undefined,
      q21: 5,
      q22: "없는 선택",
      q16: "",
    };
    expect(countAnswered(answers)).toEqual({ answered: 13, total: 24 });
  });

  test("빈 배열, 이름 없는 학과, 범위 밖 choice 는 세지 않는다", () => {
    expect(
      countAnswered({
        q11: [],
        q13: [],
        q10: { name: " " },
        q3: "없음",
        q5: "고민 중",
      }),
    ).toEqual({ answered: 1, total: 24 });
  });

  test("객체가 아니면 0 이다", () => {
    expect(countAnswered(null)).toEqual({ answered: 0, total: 24 });
    expect(countAnswered([1])).toEqual({ answered: 0, total: 24 });
  });
});

describe("pushUniversity", () => {
  const a = { name: "가대" };
  const b = { name: "나대" };
  const c = { name: "다대" };

  test("두 개 미만이면 뒤에 붙인다", () => {
    expect(pushUniversity([], a)).toEqual([a]);
    expect(pushUniversity([a], b)).toEqual([a, b]);
  });

  test("세 번째를 고르면 가장 먼저 고른 대학을 뺀다", () => {
    expect(pushUniversity([a, b], c)).toEqual([b, c]);
  });

  test("같은 이름은 무시하고 입력은 바꾸지 않는다", () => {
    const list = [a, b];
    expect(pushUniversity(list, { name: "가대" })).toEqual([a, b]);
    pushUniversity(list, c);
    expect(list).toEqual([a, b]);
  });
});

describe("isShortAnswer", () => {
  test("trim 후 10자 미만이면 true 다", () => {
    expect(isShortAnswer("가".repeat(9))).toBe(true);
    expect(isShortAnswer("가".repeat(10))).toBe(false);
    expect(isShortAnswer(`  ${"가".repeat(9)}  `)).toBe(true);
    expect(isShortAnswer("")).toBe(true);
  });
});
