import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FRONT_PAGES } from "../testPages";
import ScoreBars from "./ScoreBars";

describe("ScoreBars", () => {
  it("shows label, score and state per bar with a labeled bar", () => {
    render(<ScoreBars bars={FRONT_PAGES.p5.mind.bars} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(
      screen.getByRole("img", { name: "불안 회복 65" }),
    ).toBeInTheDocument();
    const row = screen.getByText("불안 회복").closest("li") as HTMLElement;
    expect(within(row).getByText("65")).toBeInTheDocument();
    expect(within(row).getByText("보통")).toBeInTheDocument();
  });
});
