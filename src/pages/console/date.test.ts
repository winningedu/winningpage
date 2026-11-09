import { describe, expect, it } from "vitest";
import { dotDate, kstDaysAgoText, kstDotDate, kstDotDateTime } from "./date";

describe("콘솔 날짜 표기", () => {
  it("날짜의 하이픈을 점으로 바꾼다", () => {
    expect(dotDate("2026-11-05")).toBe("2026.11.05");
  });

  it("시각은 한국 날짜로 바꾼다(협정 세계시 15시부터 다음 날)", () => {
    expect(kstDotDate("2026-11-04T14:59:00Z")).toBe("2026.11.04");
    expect(kstDotDate("2026-11-04T15:00:00Z")).toBe("2026.11.05");
  });

  it("며칠 전인지는 한국 달력 날짜로 센다", () => {
    const now = new Date("2026-11-05T01:00:00Z");
    expect(kstDaysAgoText("2026-11-04T15:30:00Z", now)).toBe("오늘");
    expect(kstDaysAgoText("2026-11-04T14:30:00Z", now)).toBe("1일 전");
    expect(kstDaysAgoText("2026-10-29T00:00:00Z", now)).toBe("7일 전");
  });

  it("시각은 한국 시간 YYYY.MM.DD HH:mm 으로 바꾼다", () => {
    expect(kstDotDateTime(new Date("2026-11-03T05:20:00Z"))).toBe(
      "2026.11.03 14:20",
    );
    expect(kstDotDateTime(new Date("2026-11-03T15:05:00Z"))).toBe(
      "2026.11.04 00:05",
    );
  });
});
