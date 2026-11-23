import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScoreBars from "./ScoreBars";
import StatusBadge from "./StatusBadge";

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
});

describe("ScoreBars colors by state", () => {
  it("colors each bar fill and badge by the payload state code, not by the score", () => {
    const bar = (code: string, score: number, stateCode: string) =>
      ({ code, label: code, score, state: "x", stateCode }) as never;
    // scores deliberately disagree with the codes: the view must not re-derive them
    render(
      <ScoreBars
        bars={[
          bar("a", 90, "WEAK"),
          bar("b", 90, "LOW"),
          bar("c", 10, "MID"),
          bar("d", 10, "TOP"),
        ]}
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
