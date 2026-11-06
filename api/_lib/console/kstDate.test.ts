// KST 날짜 도우미. 협정 세계시 15시부터는 한국 시각으로 다음 날이다.

import { describe, expect, test } from "vitest";
import { kstDateOffset } from "./kstDate.js";

describe("kstDateOffset", () => {
  test("gives the KST date, a UTC evening already belongs to the next KST day", () => {
    expect(kstDateOffset(new Date("2026-11-04T14:59:00Z"), 0)).toBe(
      "2026-11-04",
    );
    expect(kstDateOffset(new Date("2026-11-04T15:00:00Z"), 0)).toBe(
      "2026-11-05",
    );
  });

  test("counts days back across a month boundary", () => {
    expect(kstDateOffset(new Date("2026-11-02T03:00:00Z"), 3)).toBe(
      "2026-10-30",
    );
  });
});
