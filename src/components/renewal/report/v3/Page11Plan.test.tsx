import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p11 } from "./laterPagesFixture";
import Page11Plan from "./Page11Plan";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page11Plan (22 r101-r107)", () => {
  it("renders head, urgency, events, the 3 x 4 table, numbers, tips and checkpoints", () => {
    render(<Page11Plan page={p11} />);
    for (const t of [
      "P11 title",
      "PLAN lead",
      "URG label",
      "URG text",
      "EVT within1",
      "EVT after",
      "COL1",
      "COL2",
      "COL3",
      "W1a",
      "W4c",
      "RULE note",
      "MINLOAD text",
      "TIP1",
      "CHECK1",
      "CHECK2",
      "11 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("row")).toHaveLength(5);
    expect(screen.getByText("15")).toBeInTheDocument();
    for (const rate of ["80", "70", "60"]) {
      expect(screen.getByText(rate)).toBeInTheDocument();
    }
  });

  it("marks only the reduced week and shows the reduce note (22 r104)", () => {
    render(<Page11Plan page={p11} />);
    expect(screen.getByText("REDUCE note")).toBeInTheDocument();
    expect(screen.getAllByTestId("reduced-week")).toHaveLength(1);
    expect(screen.getByTestId("reduced-week").closest("tr")).toHaveTextContent(
      "W2a",
    );
  });

  it("shows the no-events note instead of the event list (22 r103)", () => {
    render(
      <Page11Plan
        page={{ ...p11, events: { kind: "none", text: "NOEVT note" } }}
      />,
    );
    expect(screen.getByText("NOEVT note")).toBeInTheDocument();
    expect(screen.queryByText("EVT within1")).toBeNull();
  });

  it("omits style tips when absent (22 r106)", () => {
    const { styleTips: _omitted, ...page } = p11;
    render(<Page11Plan page={page} />);
    expect(screen.queryByText("TIP1")).toBeNull();
  });
});
