import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidBirthDate } from "./validators";

const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));
vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.value }));

// 2026-11-30T16:00Z: 서울은 12-01, 로스앤젤레스는 11-30
describe("isValidBirthDate 오늘 기준", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-30T16:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("브라우저 시간대의 오늘 생일은 미래가 아니다", () => {
    zone.value = "Asia/Seoul";
    expect(isValidBirthDate("20261201")).toBe(true);
  });

  it("브라우저 시간대에서 아직 오지 않은 날짜는 거부한다", () => {
    zone.value = "America/Los_Angeles";
    expect(isValidBirthDate("20261201")).toBe(false);
    expect(isValidBirthDate("20261130")).toBe(true);
  });

  it("없는 날짜는 거부한다", () => {
    expect(isValidBirthDate("20240230")).toBe(false);
  });
});
