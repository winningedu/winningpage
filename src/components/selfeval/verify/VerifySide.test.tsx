import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SummaryCard } from "./VerifySide";
import type { VerificationSummary } from "./verifyLogic";

const summary = (
  over: Partial<VerificationSummary> = {},
): VerificationSummary => ({
  total: 80,
  submittable: true,
  totalChecks: 10,
  passChecks: 10,
  needChecks: 0,
  mandatoryCount: 0,
  clicheDensity: 0,
  numberCount: 2,
  sentenceCount: 9,
  promptMissing: false,
  ...over,
});

describe("SummaryCard", () => {
  test("문항 없이 채점했으면 총점 옆에 문항 미입력을 보인다", () => {
    render(<SummaryCard summary={summary({ promptMissing: true })} />);
    expect(screen.getByText("80 / 100")).toBeVisible();
    expect(screen.getByText("문항 미입력")).toBeVisible();
  });

  test("문항이 있으면 문항 미입력을 보이지 않는다", () => {
    render(<SummaryCard summary={summary()} />);
    expect(screen.queryByText("문항 미입력")).toBeNull();
  });
});
