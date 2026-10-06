import { describe, expect, test } from "vitest";
import type { VerificationSections } from "@/lib/selfeval/types";
import { discriminationLabel, summarizeVerification } from "./verifyLogic";

const sections = (over: Partial<VerificationSections> = {}) =>
  ({
    items: [
      {
        key: "judgment",
        label: "판단",
        max: 15,
        discrimination: 70,
        score: 10,
        checks: [
          { text: "a", pass: true },
          { text: "b", pass: false },
        ],
      },
      {
        key: "next",
        label: "다음 단계",
        max: 5,
        discrimination: null,
        score: 5,
        checks: [{ text: "c", pass: true }],
      },
    ],
    total: 72,
    format: [],
    mandatoryFixes: [],
    submittable: true,
    improvements: [],
    excluded: [],
    growthFit: null,
    charCount: { withSpace: 500, withoutSpace: 420 },
    sentenceCount: 9,
    clicheDensity: 0.4,
    clicheHits: [],
    numberCount: 3,
    ...over,
  }) as VerificationSections;

describe("discriminationLabel", () => {
  test("값이 있으면 +Np, 없으면 판별력 없음", () => {
    expect(discriminationLabel(70)).toBe("+70p");
    expect(discriminationLabel(null)).toBe("판별력 없음");
  });
});

describe("summarizeVerification", () => {
  test("확인 문장 수와 통과, 확인 필요, 필수 수정 수를 센다", () => {
    expect(
      summarizeVerification(
        sections({
          mandatoryFixes: [{ key: "cliche", message: "m", detail: null }],
          submittable: false,
        }),
      ),
    ).toMatchObject({
      total: 72,
      submittable: false,
      totalChecks: 3,
      passChecks: 2,
      needChecks: 1,
      mandatoryCount: 1,
      clicheDensity: 0.4,
      numberCount: 3,
      sentenceCount: 9,
    });
  });
});
