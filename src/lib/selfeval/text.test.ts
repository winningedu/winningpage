import { describe, expect, test } from "vitest";
import { extractNumbers, splitSentences } from "./text";

describe("splitSentences", () => {
  test("마침표 뒤 공백에서 나누고 소수점은 경계가 아니다", () => {
    expect(splitSentences("정확도는 0.71이었다. 다음 실험을 했다.")).toEqual([
      "정확도는 0.71이었다.",
      "다음 실험을 했다.",
    ]);
  });

  test("따옴표 안의 마침표는 경계가 아니다", () => {
    expect(splitSentences('보고서 "A. B 분석"을 읽었다. 정리했다.')).toEqual([
      '보고서 "A. B 분석"을 읽었다.',
      "정리했다.",
    ]);
  });
});

describe("extractNumbers", () => {
  test("단위가 붙은 수와 퍼센트를 한 토큰으로 잡는다", () => {
    expect(extractNumbers("40명 중 12.5%가 3회 응답했다")).toEqual([
      "40명",
      "12.5%",
      "3회",
    ]);
  });
});
