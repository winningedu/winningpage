import { describe, expect, it } from "vitest";
import { extractPromptKeywords } from "./promptKeywords.js";

describe("extractPromptKeywords", () => {
  it("지시어를 빼고 자주 나온 순으로 돌려준다", () => {
    const prompt =
      "수업에서 배운 환율 개념을 활용한 활동 내용을 서술하시오. 환율이 물가에 미친 영향을 통해 자신의 판단을 쓰시오.";
    const out = extractPromptKeywords(prompt, 10);
    expect(out[0]).toBe("환율");
    for (const stop of [
      "서술하시오",
      "쓰시오",
      "활동",
      "내용",
      "자신",
      "통해",
    ]) {
      expect(out).not.toContain(stop);
    }
    expect(out).toContain("물가");
  });

  it("빈도가 같으면 먼저 나온 순서를 지킨다", () => {
    expect(extractPromptKeywords("환율 금리 통화")).toEqual([
      "환율",
      "금리",
      "통화",
    ]);
  });

  it("limit 개수까지만 돌려준다", () => {
    expect(
      extractPromptKeywords("가나 다라 마바 사아 자차 카타", 3),
    ).toHaveLength(3);
    expect(extractPromptKeywords("가나 다라 마바 사아 자차 카타")).toHaveLength(
      5,
    );
  });

  it("키워드가 없으면 빈 배열이다", () => {
    expect(extractPromptKeywords("")).toEqual([]);
  });
});
