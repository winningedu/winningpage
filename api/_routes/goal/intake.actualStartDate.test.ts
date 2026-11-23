// 온보딩 원점(actual_start_date)은 학생 현지 날짜다.
import { describe, expect, it } from "vitest";
import { resolveActualStartDate } from "./intake.js";

const NOW = new Date("2026-11-22T15:30:00Z");

describe("resolveActualStartDate", () => {
  it("서울 학생은 현지 날짜 2026-11-23", () => {
    expect(resolveActualStartDate(true, NOW, "Asia/Seoul")).toBe("2026-11-23");
  });

  it("LA 학생은 현지 날짜 2026-11-22", () => {
    expect(resolveActualStartDate(true, NOW, "America/Los_Angeles")).toBe(
      "2026-11-22",
    );
  });

  it("수시 컷이 없으면 원점을 두지 않는다", () => {
    expect(resolveActualStartDate(false, NOW, "Asia/Seoul")).toBeNull();
  });
});
