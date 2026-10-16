import { describe, expect, test } from "vitest";
import { isVerificationStale } from "./verification";

const report = (createdAt: string) => ({
  id: "r",
  revision: 1,
  sections: null,
  charCount: null,
  score: null,
  mandatoryFixes: null,
  createdAt,
});

describe("isVerificationStale", () => {
  test("검증이 아직 없으면 낡았다고 본다(다시 검증해야 한다)", () => {
    expect(
      isVerificationStale({
        reports: { verification: null },
        current: report("2026-10-01T00:00:00Z"),
      }),
    ).toBe(true);
  });

  test("현재 본문이 검증보다 뒤에 만들어졌으면 낡았다", () => {
    expect(
      isVerificationStale({
        reports: { verification: report("2026-10-01T00:00:00Z") },
        current: report("2026-10-01T00:05:00Z"),
      }),
    ).toBe(true);
  });

  test("검증이 현재 본문보다 뒤면 최신이다", () => {
    expect(
      isVerificationStale({
        reports: { verification: report("2026-10-01T00:05:00Z") },
        current: report("2026-10-01T00:00:00Z"),
      }),
    ).toBe(false);
  });

  test("검증 본문이 없는 세션(current 없음)은 낡았다고 보지 않는다", () => {
    expect(
      isVerificationStale({
        reports: { verification: report("2026-10-01T00:05:00Z") },
        current: null,
      }),
    ).toBe(false);
  });
});
