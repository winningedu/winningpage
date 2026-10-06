import { describe, expect, test } from "vitest";
import { SURVEY_QUESTIONS } from "../../../../api/_lib/growth/intake/survey.js";
import {
  type AnswersState,
  answersReducer,
  countAnswered,
  diffAnswers,
  firstUnansweredNumber,
  initialAnswers,
  isShortAnswer,
} from "./surveyState";

const base = {
  questions: SURVEY_QUESTIONS,
  openReport: null,
  prefill: {
    survey: null,
    autoFilled: { favoriteSubjects: [], books: [] },
    previousAnswers: null,
  },
};

describe("initialAnswers", () => {
  test("재진입이면 저장된 답을 그대로 복원하고 출처 배지는 달지 않는다", () => {
    const result = initialAnswers({
      ...base,
      openReport: { answers: { q1: "책 읽음", q5: "고민 중" } },
      prefill: {
        ...base.prefill,
        survey: { filledFrom: "diagnosis", q5: "정해짐" },
      },
    });
    expect(result.answers).toEqual({ q1: "책 읽음", q5: "고민 중" });
    expect(result.origins).toEqual({});
  });

  test("저장된 답의 형식이 틀린 키는 버린다", () => {
    const result = initialAnswers({
      ...base,
      openReport: { answers: { q5: "없는 선택지", q99: "x", q1: "ok" } },
    });
    expect(result.answers).toEqual({ q1: "ok" });
  });

  test("회차가 없으면 무료진단 값을 채우고 출처를 표시한다", () => {
    const result = initialAnswers({
      ...base,
      prefill: {
        ...base.prefill,
        survey: {
          filledFrom: "diagnosis",
          q5: "정해짐",
          q10: { name: "도시공학과", source: "diagnosis" },
        },
      },
    });
    expect(result.answers).toEqual({
      q5: "정해짐",
      q10: { name: "도시공학과", source: "diagnosis" },
    });
    expect(result.origins).toEqual({ q5: "diagnosis", q10: "diagnosis" });
  });

  test("활동에서 확인된 선호 과목과 책을 q8, q16 에 채운다", () => {
    const result = initialAnswers({
      ...base,
      prefill: {
        ...base.prefill,
        autoFilled: {
          favoriteSubjects: ["확률과 통계", "물리"],
          books: ["도시의 승리"],
        },
      },
    });
    expect(result.answers).toEqual({
      q8: "확률과 통계, 물리",
      q16: "도시의 승리",
    });
    expect(result.origins).toEqual({ q8: "activity", q16: "activity" });
  });

  test("우선순위는 이전 회차, 무료진단, 활동 순이며 비어 있는 키만 채운다", () => {
    const result = initialAnswers({
      ...base,
      prefill: {
        survey: { filledFrom: "diagnosis", q5: "정해짐", q24: "모름" },
        autoFilled: { favoriteSubjects: ["물리"], books: [] },
        previousAnswers: { q5: "탐색 중", q8: "화학" },
      },
    });
    expect(result.answers).toEqual({ q5: "탐색 중", q8: "화학", q24: "모름" });
    expect(result.origins).toEqual({
      q5: "previous",
      q8: "previous",
      q24: "diagnosis",
    });
  });

  test("형식이 틀린 프리필 값은 채우지 않는다", () => {
    const result = initialAnswers({
      ...base,
      prefill: {
        ...base.prefill,
        survey: { filledFrom: "diagnosis", q5: "없는 값", q11: [{ name: "" }] },
      },
    });
    expect(result.answers).toEqual({});
  });
});

describe("answersReducer", () => {
  const start: AnswersState = {
    answers: { q5: "정해짐" },
    origins: { q5: "diagnosis" },
  };

  test("답을 바꾸면 값이 들어가고 그 키의 출처 배지가 사라진다", () => {
    const next = answersReducer(start, {
      type: "change",
      key: "q5",
      value: "고민 중",
    });
    expect(next.answers.q5).toBe("고민 중");
    expect(next.origins).toEqual({});
  });

  test("다른 키의 출처는 유지한다", () => {
    const next = answersReducer(start, {
      type: "change",
      key: "q1",
      value: "책",
    });
    expect(next.origins).toEqual({ q5: "diagnosis" });
  });

  test("빈 문자열과 공백은 문항 비우기(null)가 된다", () => {
    const next = answersReducer(start, {
      type: "change",
      key: "q5",
      value: "   ",
    });
    expect(next.answers.q5).toBeNull();
  });

  test("빈 배열도 비우기가 된다", () => {
    const next = answersReducer(start, {
      type: "change",
      key: "q11",
      value: [],
    });
    expect(next.answers.q11).toBeNull();
  });
});

describe("countAnswered", () => {
  test("답한 문항 수와 전체 24를 돌려준다", () => {
    expect(
      countAnswered(SURVEY_QUESTIONS, {
        q1: "a",
        q2: null,
        q5: "정해짐",
        q10: { name: "도시공학과" },
        q11: [],
      }),
    ).toEqual({ answered: 3, total: 24 });
  });

  test("공백만 있는 글은 답으로 세지 않는다", () => {
    expect(countAnswered(SURVEY_QUESTIONS, { q1: "  " }).answered).toBe(0);
  });
});

describe("firstUnansweredNumber", () => {
  test("답이 없는 첫 문항 번호를 돌려준다", () => {
    expect(firstUnansweredNumber(SURVEY_QUESTIONS, { q1: "a", q2: "b" })).toBe(
      3,
    );
  });
  test("모두 답했으면 null", () => {
    const all = Object.fromEntries(
      SURVEY_QUESTIONS.map((q) => [
        q.key,
        q.kind === "text"
          ? "x"
          : q.kind === "choice"
            ? q.options?.[0]
            : q.kind === "multi"
              ? [q.options?.[0]]
              : q.kind === "department"
                ? { name: "d" }
                : [{ name: "u" }],
      ]),
    );
    expect(firstUnansweredNumber(SURVEY_QUESTIONS, all as never)).toBeNull();
  });
});

describe("isShortAnswer", () => {
  test("10자 미만이면 짧은 답이다", () => {
    expect(isShortAnswer("책 읽음")).toBe(true);
    expect(isShortAnswer("1234567890")).toBe(false);
  });
  test("아무것도 안 적었으면 안내를 띄우지 않는다", () => {
    expect(isShortAnswer("")).toBe(false);
    expect(isShortAnswer("   ")).toBe(false);
  });
});

describe("diffAnswers", () => {
  test("바뀐 키만 모은다", () => {
    expect(
      diffAnswers({ q1: "a", q5: "정해짐" }, { q1: "a", q5: "고민 중" }),
    ).toEqual({
      q5: "고민 중",
    });
  });
  test("사라진 키는 null 로 보낸다", () => {
    expect(diffAnswers({ q1: "a" }, { q1: null })).toEqual({ q1: null });
    expect(diffAnswers({ q1: "a" }, {})).toEqual({ q1: null });
  });
  test("저장본에 없고 지금도 비어 있으면 보내지 않는다", () => {
    expect(diffAnswers({}, { q1: null })).toEqual({});
  });
  test("객체 값은 내용으로 비교한다", () => {
    const a = { q10: { name: "도시공학과", source: "search" as const } };
    expect(diffAnswers(a, { q10: { ...a.q10 } })).toEqual({});
  });
  test("프리필 값은 저장본에 없으므로 첫 저장 때 함께 보낸다", () => {
    expect(diffAnswers({}, { q5: "정해짐" })).toEqual({ q5: "정해짐" });
  });
});
