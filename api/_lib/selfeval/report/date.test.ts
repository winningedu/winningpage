import { describe, expect, it } from "vitest";
import { academicYearWindow, coverDate, dotDate } from "./date.js";

describe("리포트 날짜 표기", () => {
  it("같은 순간이 회원 시간대의 달력 날짜로 찍힌다", () => {
    const at = "2026-11-09T16:30:00.000Z";
    expect(dotDate(at, "Asia/Seoul")).toBe("2026.11.10");
    expect(dotDate(at, "UTC")).toBe("2026.11.09");
    expect(coverDate(at, "Asia/Seoul")).toBe("2026. 11. 10");
    expect(coverDate(at, "America/Los_Angeles")).toBe("2026. 11. 09");
  });

  it("학년도 기간은 회원 시간대 3월 1일 0시부터 다음 3월 1일 0시 전까지다", () => {
    expect(academicYearWindow(2026, "Asia/Seoul")).toEqual({
      from: "2026-02-28T15:00:00.000Z",
      to: "2027-02-28T15:00:00.000Z",
    });
    expect(academicYearWindow(2026, "UTC")).toEqual({
      from: "2026-03-01T00:00:00.000Z",
      to: "2027-03-01T00:00:00.000Z",
    });
  });
});
