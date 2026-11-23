import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p16 } from "./laterPagesFixture";
import Page16Services from "./Page16Services";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page16Services (22 r115-r121)", () => {
  it("renders chips, 2 cards with prefix and tags, scope note, agenda, reading and footer", () => {
    render(<Page16Services page={p16} />);
    for (const t of [
      "P16 title",
      "PREF1",
      "PREF2",
      "SVC name1",
      "SVC name2",
      "RANK1",
      "RANK2",
      "SVC text1",
      "SVC text2",
      "TAG1",
      "TAG2",
      "SCOPE note",
      "AGENDA1",
      "AGENDA2",
      "AGENDA3",
      "READ1",
      "FOOT basis",
      "FOOT limit",
      "16 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("omits the scope note when absent (22 r118)", () => {
    const { scopeNote: _omitted, ...page } = p16;
    render(<Page16Services page={page} />);
    expect(screen.queryByText("SCOPE note")).toBeNull();
  });
});
