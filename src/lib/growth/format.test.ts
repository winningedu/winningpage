import { describe, expect, it } from "vitest";
import { formatKoreanDate } from "./format";

describe("formatKoreanDate", () => {
  it("기본은 서울 시간 기준 날짜로 만든다(UTC 자정 직전도 다음 날)", () => {
    expect(formatKoreanDate("2026-11-01T16:00:00Z")).toBe("2026년 11월 2일");
    expect(formatKoreanDate("2026-11-14T00:00:00Z")).toBe("2026년 11월 14일");
  });

  it("시간대를 지정할 수 있다", () => {
    expect(formatKoreanDate("2026-11-01T16:00:00Z", { timeZone: "UTC" })).toBe(
      "2026년 11월 1일",
    );
  });

  it("비었거나 해석할 수 없으면 null", () => {
    expect(formatKoreanDate("")).toBeNull();
    expect(formatKoreanDate(null)).toBeNull();
    expect(formatKoreanDate("x")).toBeNull();
  });
});
