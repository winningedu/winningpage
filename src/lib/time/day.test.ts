import { describe, expect, it } from "vitest";
import { addDaysYmd, ymdIn } from "./day.js";

describe("ymdIn", () => {
  it("서울 자정 직후 순간은 다음 날이다", () => {
    expect(ymdIn("2026-11-22T15:00:00Z", "Asia/Seoul")).toBe("2026-11-23");
  });

  it("서울 자정 직전 순간은 전날이다", () => {
    expect(ymdIn("2026-11-22T14:59:59.999Z", "Asia/Seoul")).toBe("2026-11-22");
  });

  it("같은 순간도 로스앤젤레스에서는 전날이다", () => {
    expect(ymdIn("2026-11-22T15:00:00Z", "America/Los_Angeles")).toBe(
      "2026-11-22",
    );
  });

  it("Date 와 ISO 문자열을 모두 받는다", () => {
    const iso = "2026-11-22T15:00:00Z";
    expect(ymdIn(new Date(iso), "Asia/Seoul")).toBe(ymdIn(iso, "Asia/Seoul"));
  });
});

describe("addDaysYmd", () => {
  it("월 경계를 넘는다", () => {
    expect(addDaysYmd("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("연 경계를 넘는다", () => {
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("윤일을 지난다", () => {
    expect(addDaysYmd("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysYmd("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("음수 일수는 과거로 간다", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysYmd("2027-01-01", -1)).toBe("2026-12-31");
  });
});
