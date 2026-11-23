import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p7 } from "./laterPagesFixture";
import Page07Admission from "./Page07Admission";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page07Admission (22 r71-r77)", () => {
  it("renders title, comparison rows, band text, cards, roadmap and notes on a sheet footed 7 / 16", () => {
    render(<Page07Admission page={p7} />);
    expect(screen.getByText("P7 title")).toBeInTheDocument();
    for (const t of [
      "CUT50 label",
      "CUT70 label",
      "MINE label",
      "DIFF text",
      "SOURCE text",
      "BAND headline",
      "BAND text",
      "PRECISION text",
      "CARD q",
      "CARD a",
      "CARD text",
      "ROADMAP title",
      "WHEN1",
      "STEP2",
      "NOTE admission",
      "NOTE prob",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText("7 / 16")).toBeInTheDocument();
  });

  it("shows only the notice and names when the result is not computed (22 r74)", () => {
    render(
      <Page07Admission
        page={{
          ...p7,
          result: {
            kind: "notice",
            text: "NOTICE text",
            universityName: "UNIV",
          },
        }}
      />,
    );
    expect(screen.getByText("NOTICE text")).toBeInTheDocument();
    expect(screen.getByText("UNIV")).toBeInTheDocument();
    expect(screen.queryByText("CUT70 label")).toBeNull();
  });
});
