import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidBirthDate } from "./mentor-apply.js";

const ZONES = ["Asia/Seoul", "America/Los_Angeles", "UTC"];

// 2026-11-30T16:00Z: 서울 12-01, 로스앤젤레스 11-30, UTC 11-30
describe("mentor-apply 생년월일 검증은 프로세스 TZ와 무관하다", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-30T16:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each(ZONES)("TZ=%s 에서 같은 결과를 낸다", (tz) => {
    process.env.TZ = tz;
    expect(isValidBirthDate("20261130")).toBe(true);
    expect(isValidBirthDate("20261201")).toBe(false);
    expect(isValidBirthDate("20240229")).toBe(true);
    expect(isValidBirthDate("20250229")).toBe(false);
    expect(isValidBirthDate("18991231")).toBe(false);
  });
});
