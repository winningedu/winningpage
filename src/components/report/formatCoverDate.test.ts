import { describe, expect, it } from "vitest";
import { formatCoverDate, formatCoverPeriod } from "./formatCoverDate";

describe("formatCoverDate", () => {
  it("점 뒤에 공백을 둔 날짜로 만든다", () => {
    expect(formatCoverDate("2026-10-16T03:00:00Z")).toBe("2026. 10. 16");
  });

  it("한국 시간 기준으로 날짜를 센다", () => {
    expect(formatCoverDate("2026-10-15T16:00:00Z")).toBe("2026. 10. 16");
  });

  it("값이 없거나 날짜가 아니면 null", () => {
    expect(formatCoverDate(null)).toBeNull();
    expect(formatCoverDate(undefined)).toBeNull();
    expect(formatCoverDate("abc")).toBeNull();
  });
});

describe("formatCoverPeriod", () => {
  it("시작일과 종료일을 각각 표지 날짜로 바꿔 ~ 로 잇는다", () => {
    expect(formatCoverPeriod("2026-10-19 ~ 2026-10-25")).toBe(
      "2026. 10. 19 ~ 2026. 10. 25",
    );
  });

  it("값이 없거나 두 날짜로 읽을 수 없으면 null", () => {
    expect(formatCoverPeriod(undefined)).toBeNull();
    expect(formatCoverPeriod("")).toBeNull();
    expect(formatCoverPeriod("2026-10-19")).toBeNull();
  });
});
