import { describe, expect, it } from "vitest";
import { browserTimeZone, isValidTimeZone } from "./zone.js";

describe("isValidTimeZone", () => {
  it.each(["Asia/Seoul", "America/New_York", "UTC"])("%s 는 유효하다", (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(["", null, 123, "+09:00", "UTC+9", "KST", "Not/AZone"])(
    "%j 는 유효하지 않다",
    (tz) => {
      expect(isValidTimeZone(tz)).toBe(false);
    },
  );
});

describe("browserTimeZone", () => {
  it("Intl 이 알려 주는 시간대를 돌려준다", () => {
    expect(browserTimeZone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(isValidTimeZone(browserTimeZone())).toBe(true);
  });
});
