import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import RecordCooldownSummary from "./RecordCooldownSummary";

describe("RecordCooldownSummary 해제 시각", () => {
  const cooldown = {
    active: true,
    submittedAt: "2026-11-22T03:30:00Z",
    unlocksAt: "2026-11-22T15:30:00Z",
  };

  test.each([
    ["Asia/Seoul", "00:30"],
    ["America/Los_Angeles", "07:30"],
  ])("%s 학생은 다시 기록 가능 시각이 %s다", (timeZone, label) => {
    render(
      <RecordCooldownSummary
        cooldown={cooldown}
        summary={null}
        tomorrowTargets={{ idealHours: 0, minHours: 0 }}
        timeZone={timeZone}
      />,
    );
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
  });
});
