import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { planner } from "./laterPagesFixture";
import PlannerPage from "./PlannerPage";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("PlannerPage (22 r109-r113)", () => {
  it("renders week head, done criteria, task table, 7 day cells and slip rules", () => {
    render(<PlannerPage page={planner(2)} no={13} />);
    for (const t of [
      "GOAL2",
      "BADGE2",
      "REDX2",
      "DONE2a",
      "AREA2",
      "TASK2",
      "DUE2",
      "DONEAT2",
      "SLIP2",
      "13 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId("day-cell")).toHaveLength(7);
    expect(screen.getByText("DAYTASK2")).toBeInTheDocument();
  });

  it("leaves the completion date column blank when a task has none (22 r111)", () => {
    render(<PlannerPage page={planner(1)} no={12} />);
    const rows = screen.getAllByRole("row");
    const blank = within(
      rows.find(
        (r) =>
          r.textContent?.includes("TASK1") && !r.textContent.includes("TASKB1"),
      ) as HTMLElement,
    ).getAllByRole("cell");
    expect(blank).toHaveLength(4);
    expect(blank[3]).toBeEmptyDOMElement();
  });

  it("marks highlighted days (22 r112)", () => {
    render(<PlannerPage page={planner(1)} no={12} />);
    expect(
      screen
        .getAllByTestId("day-cell")
        .filter((c) => c.dataset.highlight === "true"),
    ).toHaveLength(1);
  });
});
