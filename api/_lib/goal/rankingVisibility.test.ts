// QA 행71, 활성 학생이 RANKING_MIN_STUDENTS(200) 미만이면 순위 카드를 숨긴다.
import { describe, expect, test } from "vitest";
import { isRankingVisible, RANKING_MIN_STUDENTS } from "./rankingVisibility.js";

describe("isRankingVisible", () => {
  test("기준은 200명이다", () => {
    expect(RANKING_MIN_STUDENTS).toBe(200);
  });

  test("활성 학생 199명이면 숨긴다", () => {
    expect(isRankingVisible(199)).toBe(false);
  });

  test("활성 학생 200명이면 보인다", () => {
    expect(isRankingVisible(200)).toBe(true);
  });
});
