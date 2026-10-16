import { describe, expect, test } from "vitest";
import {
  E2E_PREFIX,
  e2eText,
  hasE2ePrefix,
  isE2eOpenedReport,
  sharedQaAccountWarning,
  stripE2eAnswers,
} from "./marker";

describe("E2E 데이터 접두어", () => {
  test("e2eText 는 접두어를 붙이고 hasE2ePrefix 가 알아본다", () => {
    expect(e2eText("조사 답")).toBe(`${E2E_PREFIX}조사 답`);
    expect(hasE2ePrefix(e2eText("수집"))).toBe(true);
  });

  test("접두어가 앞에 없거나 문자열이 아니면 E2E 데이터가 아니다", () => {
    expect(hasE2ePrefix("실제 학생 답 E2E 포함")).toBe(false);
    expect(hasE2ePrefix("E2E조사")).toBe(false);
    expect(hasE2ePrefix(null)).toBe(false);
    expect(hasE2ePrefix(3)).toBe(false);
  });
});

describe("stripE2eAnswers", () => {
  test("접두어로 시작하는 답의 키만 비우고 나머지는 그대로 둔다", () => {
    const result = stripE2eAnswers({
      q1: "E2E 조사 답 1",
      q2: "실제 답",
      q3: 5,
      q4: ["E2E 배열"],
    });
    expect(result.cleaned).toEqual({ q2: "실제 답", q3: 5, q4: ["E2E 배열"] });
    expect(result.removedKeys).toEqual(["q1"]);
  });

  test("지울 키가 없거나 객체가 아니면 변경 없음으로 돌려준다", () => {
    expect(stripE2eAnswers({ q1: "실제" }).removedKeys).toEqual([]);
    expect(stripE2eAnswers(null)).toEqual({ cleaned: {}, removedKeys: [] });
  });
});

describe("isE2eOpenedReport", () => {
  const e2eActivityIds = new Set(["a1"]);
  const base = {
    status: "in_progress",
    survey_answers: {},
    activity_ids: [] as string[],
  };

  test("스냅샷 답이 접두어이면 E2E 회차다", () => {
    expect(
      isE2eOpenedReport(
        { ...base, survey_answers: { q1: "E2E 조사 답 1" } },
        e2eActivityIds,
      ),
    ).toBe(true);
  });

  test("E2E 활동 기록을 고른 회차도 E2E 회차다", () => {
    expect(
      isE2eOpenedReport({ ...base, activity_ids: ["a1", "x"] }, e2eActivityIds),
    ).toBe(true);
  });

  test("접두어 흔적이 없으면 아니다", () => {
    expect(
      isE2eOpenedReport(
        { ...base, survey_answers: { q1: "실제" }, activity_ids: ["x"] },
        e2eActivityIds,
      ),
    ).toBe(false);
  });

  test("열린 상태가 아닌 회차는 흔적이 있어도 아니다", () => {
    expect(
      isE2eOpenedReport(
        { ...base, status: "completed", survey_answers: { q1: "E2E 답" } },
        e2eActivityIds,
      ),
    ).toBe(false);
  });
});

describe("sharedQaAccountWarning", () => {
  test("qa- 로 시작하는 공유 QA 계정이면 경고 문구를 돌려준다", () => {
    expect(sharedQaAccountWarning("qa-student@winning.test")).toContain(
      "e2e-student@winning.test",
    );
    expect(sharedQaAccountWarning("QA-student02@winning.test")).not.toBeNull();
  });

  test("전용 계정이면 경고가 없다", () => {
    expect(sharedQaAccountWarning("e2e-student@winning.test")).toBeNull();
  });
});
