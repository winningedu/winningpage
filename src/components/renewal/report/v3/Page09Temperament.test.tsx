import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p9 } from "./laterPagesFixture";
import Page09Temperament from "./Page09Temperament";

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

  it("omits the low reliability note when absent (22 r93)", () => {
    render(<Page09Temperament page={{ ...p9, lowReliability: undefined }} />);
    expect(screen.queryByText("LOWREL text")).toBeNull();
  });
});
