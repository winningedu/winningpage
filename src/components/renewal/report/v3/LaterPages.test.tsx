import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LaterPages from "./LaterPages";
import { laterPages } from "./laterPagesFixture";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("LaterPages", () => {
  it("renders pages 7 to 16 as 10 sheets with 4 planners of 7 day cells each", () => {
    const { container } = render(<LaterPages pages={laterPages} />);
    expect(container.querySelectorAll(".fd-report-sheet")).toHaveLength(10);
    expect(screen.getAllByTestId("day-cell")).toHaveLength(28);
    for (const n of [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      expect(screen.getByText(`${n} / 16`)).toBeInTheDocument();
    }
  });

  it("renders no page 7 for M3 (22 r70)", () => {
    const { container } = render(
      <LaterPages pages={{ ...laterPages, p7: undefined }} />,
    );
    expect(container.querySelectorAll(".fd-report-sheet")).toHaveLength(9);
    expect(screen.queryByText("P7 title")).toBeNull();
    expect(screen.queryByText("7 / 16")).toBeNull();
  });
});
