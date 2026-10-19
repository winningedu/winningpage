import { describe, expect, it } from "vitest";
import { formatCoverDate } from "./formatCoverDate";

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
