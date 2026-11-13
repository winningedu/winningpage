// 리포트 보기 전용 글 뽑기 검증: 글만 남기고 숫자와 불리언, 구조 키는 뺀다.

import { describe, expect, test } from "vitest";
import { flattenText, reportSections } from "./reportView.js";

describe("flattenText", () => {
  test("숫자와 불리언은 뺀다", () => {
    expect(flattenText({ label: "국어", score: 92, done: true, zero: 0 })).toBe(
      "국어",
    );
  });

  test("수행평가 저장 봉투의 버전, 점수, 개정 번호는 따로 한 줄로 나오지 않는다", () => {
    // api/_routes/performance/evaluate.ts 가 저장하는 모양
    const envelope = {
      v: 1,
      type: "evaluation",
      score: 87,
      summary: "논리가 좋아요",
      sections: [{ title: "강점", body: "근거가 분명해요" }],
      structure: null,
      submissionId: "sub-1",
      revision: 3,
    };
    const lines = flattenText(envelope).split("\n");
    expect(lines).not.toContain("1");
    expect(lines).not.toContain("87");
    expect(lines).not.toContain("3");
    expect(lines).toContain("논리가 좋아요");
  });
});

describe("reportSections", () => {
  test("구조 키와 숫자는 빠진다", () => {
    expect(
      reportSections([{ id: "a", title: "성적", body: "평균", avg: 3.5 }]),
    ).toEqual([{ title: "성적", text: "평균" }]);
  });

  test("긴 구역도 자르지 않는다", () => {
    const long = "가".repeat(9000);
    const sections = reportSections([{ title: "긴 글", body: long }]);
    expect(sections[0]?.text).toBe(long);
  });
});
