import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { areaState } from "@/lib/diagnosis-v3/scoring";
import ScoreBars from "./ScoreBars";
import StatusBadge, { areaStateOfScore } from "./StatusBadge";

// 15 r17: 4 states to 4 colors (WEAK red, LOW orange, MID grey, TOP blue)
const COLORS = {
  WEAK: "text-error",
  LOW: "text-amber-700",
  MID: "text-ink-sub",
  TOP: "text-primary-soft",
} as const;

describe("StatusBadge area state colors (15 r17)", () => {
  it.each(Object.entries(COLORS))("%s gets its own color", (state, cls) => {
    render(
      <StatusBadge state={state as keyof typeof COLORS}>label</StatusBadge>,
    );
    const badge = screen.getByText("label");
    expect(badge).toHaveAttribute("data-state", state);
    expect(badge).toHaveClass(cls);
  });

  it("derives the state from the score exactly as 06 r20-r23 (every integer 0..100)", () => {
    for (let s = 0; s <= 100; s++)
      expect(areaStateOfScore(s)).toBe(areaState(s));
  });
});

describe("ScoreBars colors by state", () => {
  it("colors each bar fill and badge by its score state", () => {
    const bar = (code: string, score: number) =>
      ({ code, label: code, score, state: "x" }) as never;
    render(
      <ScoreBars
        bars={[bar("a", 30), bar("b", 50), bar("c", 65), bar("d", 80)]}
      />,
    );
    const fills = screen
      .getAllByRole("img")
      .map((el) => el.firstElementChild as HTMLElement);
    expect(fills[0]).toHaveClass("bg-error");
    expect(fills[1]).toHaveClass("bg-amber-500");
    expect(fills[2]).toHaveClass("bg-ink-natural");
    expect(fills[3]).toHaveClass("bg-action");
    expect(screen.getAllByText("x")[0]).toHaveAttribute("data-state", "WEAK");
  });
});
