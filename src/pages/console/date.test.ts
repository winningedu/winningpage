import { describe, expect, it } from "vitest";
import { dateOf, dateTimeOf, daysAgoText, dotDate } from "./date";

describe("콘솔 날짜 표기", () => {
  it("날짜의 하이픈을 점으로 바꾼다", () => {
    expect(dotDate("2026-11-05")).toBe("2026.11.05");
  });

  it("시각은 주어진 시간대의 날짜로 바꾼다", () => {
    expect(dateOf("2026-11-04T14:59:00Z", "Asia/Seoul")).toBe("2026.11.04");
    expect(dateOf("2026-11-04T15:00:00Z", "Asia/Seoul")).toBe("2026.11.05");
    expect(dateOf("2026-11-04T15:00:00Z", "America/Los_Angeles")).toBe(
      "2026.11.04",
    );
  });

  it("시간대를 주지 않으면 브라우저 시간대를 쓴다", () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(dateOf("2026-11-04T15:00:00Z")).toBe(
      dateOf("2026-11-04T15:00:00Z", tz),
    );
  });

  it("며칠 전인지는 시간대의 달력 날짜로 센다", () => {
    const now = new Date("2026-11-05T01:00:00Z");
    expect(daysAgoText("2026-11-04T15:30:00Z", now, "Asia/Seoul")).toBe("오늘");
    expect(daysAgoText("2026-11-04T14:30:00Z", now, "Asia/Seoul")).toBe(
      "1일 전",
    );
    expect(daysAgoText("2026-10-29T00:00:00Z", now, "Asia/Seoul")).toBe(
      "7일 전",
    );
    // 같은 순간이 서울에서는 어제 19시, 로스앤젤레스에서는 오늘 02시다.
    expect(daysAgoText("2026-11-04T10:00:00Z", now, "Asia/Seoul")).toBe(
      "1일 전",
    );
    expect(
      daysAgoText("2026-11-04T10:00:00Z", now, "America/Los_Angeles"),
    ).toBe("오늘");
  });

  it("시각은 YYYY.MM.DD HH:mm 으로 바꾼다", () => {
    expect(dateTimeOf(new Date("2026-11-03T05:20:00Z"), "Asia/Seoul")).toBe(
      "2026.11.03 14:20",
    );
    expect(dateTimeOf(new Date("2026-11-03T15:05:00Z"), "Asia/Seoul")).toBe(
      "2026.11.04 00:05",
    );
    expect(
      dateTimeOf(new Date("2026-11-03T15:05:00Z"), "America/Los_Angeles"),
    ).toBe("2026.11.03 07:05");
  });
});
