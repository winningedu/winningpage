import { describe, expect, it } from "vitest";
import {
  coverTitleFontSize,
  coverTitleLineCount,
  coverTitleMaxLines,
} from "./coverTitleSize";

describe("coverTitleFontSize", () => {
  it("짧은 두 줄 제목은 기본 크기 7cqw 를 쓴다", () => {
    expect(coverTitleFontSize("위닝에듀\n최종 제출본")).toBe(7);
  });

  it("짧은 한 줄 제목도 7cqw 를 쓴다", () => {
    expect(coverTitleFontSize("확률과 통계 자기평가서")).toBe(7);
  });

  it.each([
    "정수론 기반의 오류 정정 코드(ECC) 원리 분석 및 데이터 통신에서의 활용",
    "축산 동물 온습도지수(THI) 적용 및 열 스트레스 완화 방안 연구",
  ])("긴 제목은 크기를 줄여 칸 안에 들어가게 한다: %s", (title) => {
    const size = coverTitleFontSize(title);

    expect(size).toBeLessThan(7);
    expect(coverTitleLineCount(title, size)).toBeLessThanOrEqual(
      coverTitleMaxLines(size),
    );
  });

  it("아주 긴 제목은 가장 작은 크기 3.2cqw 로 멈춘다", () => {
    expect(coverTitleFontSize("가".repeat(200))).toBe(3.2);
  });

  it("빈 문자열은 7cqw", () => {
    expect(coverTitleFontSize("")).toBe(7);
  });
});
