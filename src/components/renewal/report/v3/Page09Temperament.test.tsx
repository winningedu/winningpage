import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p9 } from "./laterPagesFixture";
import Page09Temperament from "./Page09Temperament";
import { TEMPERAMENT_LABELS as TL } from "./parts/labels";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page09Temperament (22 r86-r94)", () => {
  it("renders every element of the temperament profile", () => {
    render(<Page09Temperament page={p9} />);
    for (const t of [
      "P9 title",
      "TEMP lead",
      "TEMP scale",
      "HERO name",
      "HERO sub",
      "HERO body",
      "DIM text1",
      "DIM text2",
      "STUDY strength",
      "STUDY caution",
      "CROSS item",
      "TFACTOR text",
      "SWAY cause",
      "LOWREL text",
      "PROTECT text",
      "9 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("renders each dim as label, code, score and level word (PDF p9)", () => {
    render(<Page09Temperament page={p9} />);
    expect(screen.getByText("DIM label1 NS 4 LEVEL high")).toBeInTheDocument();
    expect(screen.getByText("DIM label2 HA 3 LEVEL mid")).toBeInTheDocument();
  });

  it("renders the factor heading apart from its sentence (22 r92)", () => {
    render(<Page09Temperament page={p9} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "TFACTOR heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("TFACTOR text").tagName).toBe("P");
  });

  it("heads the study, cross-check and factor lists like PDF p10", () => {
    render(<Page09Temperament page={p9} />);
    for (const [heading, item] of [
      [TL.strengths, "STUDY strength"],
      [TL.cautions, "STUDY caution"],
      [TL.crossCheck, "CROSS item"],
    ]) {
      const section = screen.getByText(heading as string).closest("section");
      expect(section).toHaveTextContent(item as string);
    }
    expect(screen.getByText(TL.study)).toBeInTheDocument();
    expect(screen.getByText(TL.factors)).toBeInTheDocument();
  });

  it("drops a study column with no items", () => {
    render(
      <Page09Temperament
        page={{ ...p9, study: { strengths: ["STUDY strength"], cautions: [] } }}
      />,
    );
    expect(screen.queryByText(TL.cautions)).toBeNull();
  });

  it("omits the low reliability note when absent (22 r93)", () => {
    const { lowReliability: _omitted, ...page } = p9;
    render(<Page09Temperament page={page} />);
    expect(screen.queryByText("LOWREL text")).toBeNull();
  });
});
