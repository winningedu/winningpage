import { describe, expect, test } from "vitest";
import { parsePeriod } from "./period.js";

// 2026-11-30T16:00:00Z: 서울은 12월 1일 01:00, 로스앤젤레스는 11월 30일 08:00.
const NOW = new Date("2026-11-30T16:00:00Z");

describe("parsePeriod", () => {
  test("서울 기준 기본 기간은 이번 달 1일부터 서울의 오늘까지", () => {
    expect(parsePeriod({}, "Asia/Seoul", NOW)).toEqual({
      from: "2026-12-01",
      to: "2026-12-01",
    });
  });

  test("로스앤젤레스 기준 같은 순간의 기본 기간은 11월", () => {
    expect(parsePeriod({}, "America/Los_Angeles", NOW)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  test("해당 시간대의 오늘보다 늦은 종료일은 거부한다", () => {
    const query = { from: "2026-11-01", to: "2026-12-01" };

    expect(parsePeriod(query, "America/Los_Angeles", NOW)).toBe(
      "종료일은 오늘을 넘을 수 없습니다.",
    );
    expect(parsePeriod(query, "Asia/Seoul", NOW)).toEqual({
      from: "2026-11-01",
      to: "2026-12-01",
    });
  });
});
