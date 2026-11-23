import { describe, expect, it } from "vitest";
import { formatKoreanDate } from "./format";

describe("formatKoreanDate", () => {
  it("회원 시간대 기준 날짜로 만든다(서울은 UTC 15시부터 다음 날)", () => {
    expect(formatKoreanDate("2026-11-22T15:30:00Z", "Asia/Seoul")).toBe(
      "2026년 11월 23일",
    );
    expect(formatKoreanDate("2026-11-14T00:00:00Z", "Asia/Seoul")).toBe(
      "2026년 11월 14일",
    );
  });

  it("로스앤젤레스 회원은 같은 순간을 전날로 본다", () => {
    expect(
      formatKoreanDate("2026-11-22T15:30:00Z", "America/Los_Angeles"),
    ).toBe("2026년 11월 22일");
  });

  it("비었거나 해석할 수 없으면 null", () => {
    expect(formatKoreanDate("", "Asia/Seoul")).toBeNull();
    expect(formatKoreanDate(null, "Asia/Seoul")).toBeNull();
    expect(formatKoreanDate("x", "Asia/Seoul")).toBeNull();
  });
});
