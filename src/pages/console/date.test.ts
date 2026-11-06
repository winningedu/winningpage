import { describe, expect, it } from "vitest";
import { dotDate, kstDotDate } from "./date";

describe("콘솔 날짜 표기", () => {
  it("날짜의 하이픈을 점으로 바꾼다", () => {
    expect(dotDate("2026-11-05")).toBe("2026.11.05");
  });

  it("시각은 한국 날짜로 바꾼다(협정 세계시 15시부터 다음 날)", () => {
    expect(kstDotDate("2026-11-04T14:59:00Z")).toBe("2026.11.04");
    expect(kstDotDate("2026-11-04T15:00:00Z")).toBe("2026.11.05");
  });
});
