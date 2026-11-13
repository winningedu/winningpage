// 리포트 보기 전용 글 뽑기 검증: 숫자는 남기고 불리언과 구조 키는 뺀다.

import { describe, expect, test } from "vitest";
import { flattenText, reportSections } from "./reportView.js";

describe("flattenText", () => {
  test("숫자는 순서대로 글에 남기고 불리언은 뺀다", () => {
    expect(flattenText({ label: "국어", score: 92, done: true, zero: 0 })).toBe(
      "국어\n92\n0",
    );
  });
});

describe("reportSections", () => {
  test("구조 키는 빠지고 숫자는 남는다", () => {
    expect(
      reportSections([{ id: "a", title: "성적", body: "평균", avg: 3.5 }]),
    ).toEqual([{ title: "성적", text: "평균\n3.5" }]);
  });

  test("긴 구역도 자르지 않는다", () => {
    const long = "가".repeat(9000);
    const sections = reportSections([{ title: "긴 글", body: long }]);
    expect(sections[0]?.text).toBe(long);
  });
});
