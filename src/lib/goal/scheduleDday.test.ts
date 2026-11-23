import { expect, test } from "vitest";
import { formatScheduleDday } from "./scheduleDday.js";

// 2026-11-22T15:30Z = 서울 11/23, 로스앤젤레스 11/22.
const INSTANT = new Date("2026-11-22T15:30:00Z");

test("D-day는 넘겨준 시간대의 오늘부터 달력 일수로 센다", () => {
  expect(formatScheduleDday("2026-11-23", INSTANT, "Asia/Seoul")).toBe("D-day");
  expect(formatScheduleDday("2026-11-23", INSTANT, "America/Los_Angeles")).toBe(
    "D-1",
  );
  expect(formatScheduleDday("2026-11-22", INSTANT, "Asia/Seoul")).toBe("D+1");
});
