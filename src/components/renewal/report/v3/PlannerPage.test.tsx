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
    expect(blank).toHaveLength(5);
    expect(blank[3]).toBeEmptyDOMElement();
    expect(blank[4]).toBeEmptyDOMElement();
  });

  it("heads the task table with the PDF p13 columns", () => {
    render(<PlannerPage page={planner(1)} no={12} />);
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["영역", "과제", "마감", "완료 기준", "완료일"]);
  });

  it("gives every day cell the plan and actual minute lines (spec row 122)", () => {
    render(<PlannerPage page={planner(1)} no={12} />);
    for (const cell of screen.getAllByTestId("day-cell")) {
      expect(within(cell).getByText("계획 ____분")).toBeInTheDocument();
      expect(within(cell).getByText("실제 ____분")).toBeInTheDocument();
    }
  });

  it("draws the weekend check box with its three blanks (PDF p13)", () => {
    render(<PlannerPage page={planner(1)} no={12} />);
    const box = screen.getByRole("region", { name: "주말 점검" });
    for (const t of ["실행률", "밀린 요일\u00b7과목", "다음 주 조정"]) {
      expect(within(box).getByText(t)).toBeInTheDocument();
    }
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
