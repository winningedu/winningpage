import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { VerificationSections } from "@/lib/selfeval/types";
import { MandatoryFixesCard } from "./VerificationCards";

const sections = (
  mandatoryFixes: VerificationSections["mandatoryFixes"],
): VerificationSections => ({
  items: [],
  total: 0,
  format: [],
  mandatoryFixes,
  submittable: false,
  improvements: [],
  excluded: [],
  growthFit: null,
  charCount: {} as VerificationSections["charCount"],
  sentenceCount: 0,
  clicheDensity: 0,
  clicheHits: [],
  numberCount: 0,
});

describe("MandatoryFixesCard", () => {
  test("필수 수정 카드는 오류 빨강이 아니라 노란 경고 톤이고 제목 문구가 남는다", () => {
    render(
      <MandatoryFixesCard
        sections={sections([
          { key: "cliche", message: "상투 표현을 줄여 주세요", detail: null },
        ])}
      />,
    );
    const card = screen.getByRole("alert", { name: "필수 수정" });
    expect(card).toHaveClass("bg-surface-warning", "border-warning");
    expect(card).not.toHaveClass("bg-error/5");
    expect(
      screen.getByText("필수 수정이 남아 있어 제출 가능으로 보지 않아요"),
    ).toBeVisible();
  });
});
