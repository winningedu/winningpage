import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p11 } from "./laterPagesFixture";
import Page11Plan from "./Page11Plan";
import { PLAN_LABELS, REPORT_LABELS } from "./parts/labels";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page11Plan (22 r101-r107)", () => {
  it("renders head, urgency, events, the 3 x 4 table, numbers, tips and checkpoints", () => {
    render(<Page11Plan page={p11} />);
    for (const t of [
      "P11 title",
      "PLAN lead",
      "URG title",
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
  });

  it("shows the q21 weekend answer directly below the minimum load line", () => {
    const page = { ...p11, numbers: { ...p11.numbers, weekend: "2~4시간" } };
    render(<Page11Plan page={page} />);
    const weekend = screen.getByText("평소 주말 자습: 2~4시간 (응답 기준)");
    expect(weekend.previousElementSibling).toHaveTextContent("MINLOAD text");
  });

  it("renders no weekend line when the weekend answer is missing", () => {
    render(<Page11Plan page={p11} />);
    expect(screen.queryByText(/평소 주말 자습/)).toBeNull();
  });

  it("labels every PDF p12 number: urgency points, week rows, the 3 numbers and checkpoints", () => {
    render(<Page11Plan page={p11} />);
    expect(screen.getByText("10점")).toBeInTheDocument();
    expect(screen.getByText(PLAN_LABELS.week)).toBeInTheDocument();
    expect(screen.getByText("1주")).toBeInTheDocument();
    expect(screen.getByText("15분")).toBeInTheDocument();
    expect(screen.getByText(PLAN_LABELS.logCaption)).toBeInTheDocument();
    expect(screen.getByText(`80${PLAN_LABELS.arrow}60%`)).toBeInTheDocument();
    expect(screen.getByText(PLAN_LABELS.rateCaption)).toBeInTheDocument();
    for (const [date, label] of [
      ["CHECK1", "1주 점검"],
      ["CHECK4", "4주 점검"],
      ["CHECK5", REPORT_LABELS.redx],
      ["CHECK6", PLAN_LABELS.afterLabel],
    ]) {
      expect(screen.getByText(date as string).closest("li")).toHaveTextContent(
        label as string,
      );
    }
  });

  it("heads the in-4-weeks and after-4-weeks event lists (PDF p12)", () => {
    render(<Page11Plan page={p11} />);
    expect(screen.getByText(PLAN_LABELS.eventsWithin)).toBeInTheDocument();
    expect(screen.getByText(PLAN_LABELS.eventsAfter)).toBeInTheDocument();
  });

  it("marks only the reduced week with a legend, without repeating the reduce note (22 r104)", () => {
    render(<Page11Plan page={p11} />);
    expect(screen.queryByText("REDUCE note")).toBeNull();
    expect(screen.getByText(PLAN_LABELS.reducedWeek)).toBeInTheDocument();
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

describe("Page11Plan without reduced weeks", () => {
  it("shows no reduced-week legend", () => {
    const weeks = p11.table.weeks.map((w) => ({ ...w, reduced: false }));
    render(<Page11Plan page={{ ...p11, table: { ...p11.table, weeks } }} />);
    expect(screen.queryByText(PLAN_LABELS.reducedWeek)).toBeNull();
  });
});
