import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime } from "./format.js";
import * as zone from "./zone.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatDate", () => {
  it("지정한 시간대의 YYYY-MM-DD 를 낸다", () => {
    expect(formatDate("2026-11-22T15:00:00Z", "Asia/Seoul")).toBe("2026-11-23");
    expect(formatDate(new Date("2026-11-22T15:00:00Z"), "UTC")).toBe(
      "2026-11-22",
    );
  });

  it("시간대를 생략하면 브라우저 시간대를 쓴다", () => {
    vi.spyOn(zone, "browserTimeZone").mockReturnValue("Asia/Seoul");
    expect(formatDate("2026-11-22T15:00:00Z")).toBe("2026-11-23");
  });
});

describe("formatDateTime", () => {
  it("YYYY-MM-DD HH:mm 24시간 표기로 낸다", () => {
    expect(formatDateTime("2026-11-22T15:05:00Z", "Asia/Seoul")).toBe(
      "2026-11-23 00:05",
    );
    expect(formatDateTime("2026-11-23T13:09:00Z", "Asia/Seoul")).toBe(
      "2026-11-23 22:09",
    );
  });

  it("자정은 24 가 아니라 00 이다", () => {
    expect(formatDateTime("2026-11-23T00:00:00Z", "UTC")).toBe(
      "2026-11-23 00:00",
    );
  });

  it("시간대를 생략하면 브라우저 시간대를 쓴다", () => {
    vi.spyOn(zone, "browserTimeZone").mockReturnValue("America/New_York");
    expect(formatDateTime("2026-11-23T05:30:00Z")).toBe("2026-11-23 00:30");
  });
});
