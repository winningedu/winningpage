import { describe, expect, test } from "vitest";
import { copy, fill } from "./copy.js";

describe("fill", () => {
  test("fills a Hangul placeholder such as {영역} (10 SVC_RANK2_PREFIX)", () => {
    const filled = fill("SVC_RANK2_PREFIX", { 영역: "활동 기록" });
    expect(filled).toBe(
      copy("SVC_RANK2_PREFIX").replace("{영역}", "활동 기록"),
    );
    expect(filled).not.toContain("{");
  });

  test("a placeholder without a value throws", () => {
    expect(() => fill("SVC_RANK2_PREFIX", {})).toThrow("no value for {영역}");
  });
});
