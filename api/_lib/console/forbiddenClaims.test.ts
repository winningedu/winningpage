// 금지 표현 검사(교 #140, 결정 106). 콘솔이 만드는 코칭 문장에 합격을 단정하는 표현이 없는지 테스트로만 본다.

import { describe, expect, test } from "vitest";
import { findForbiddenClaims } from "./forbiddenClaims.js";

describe("findForbiddenClaims 문구 판정", () => {
  test.each([
    "합격 보장합니다",
    "반드시 합격할 수 있습니다",
    "합격 확률은 34%입니다",
  ])("단정 표현은 잡는다: %s", (text) => {
    expect(findForbiddenClaims(text)).toHaveLength(1);
    expect(findForbiddenClaims(text)[0]?.text).toBe(text);
  });

  test.each([
    "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
    "이상 가나대 경영학과 34%",
    "달성율 100%",
    "방해 요인 1위 '스마트폰'",
  ])("콘솔이 쓰는 정상 문구는 잡지 않는다: %s", (text) => {
    expect(findForbiddenClaims(text)).toEqual([]);
  });

  test("중첩 객체와 배열의 문자열을 모두 훑고 빈 문자열은 건너뛴다", () => {
    const hits = findForbiddenClaims({
      a: ["", "괜찮은 문장", { b: "반드시 합격합니다" }],
      c: { d: [{ e: "합격 보장" }], n: 34, f: null },
    });
    expect(hits.map((h) => h.text)).toEqual(["반드시 합격합니다", "합격 보장"]);
  });
});
