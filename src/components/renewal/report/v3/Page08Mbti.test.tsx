import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { p8 } from "./laterPagesFixture";
import Page08Mbti from "./Page08Mbti";

vi.mock("@/config/site", () => ({ site: { brandName: "TEST" } }));

describe("Page08Mbti (22 r79-r84)", () => {
  it("renders card, poles, factors, links and disclaimer for a typed result", () => {
    render(<Page08Mbti page={p8} />);
    for (const t of [
      "ENTJ",
      "NICK",
      "STYLE",
      "SHARE",
      "POLE name E",
      "POLE habit N",
      "POLE tip N",
      "FACTORS text",
      "FACTOR habit1",
      "SMALL sample",
      "LINK1",
      "MBTI disclaimer",
      "8 / 16",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("renders only the NONE text and habits without a type card (22 r83)", () => {
    render(
      <Page08Mbti
        page={{
          mbti: { kind: "none", text: "NONE text", habits: ["NONE habit"] },
          disclaimer: "MBTI disclaimer",
        }}
      />,
    );
    expect(screen.getByText("NONE text")).toBeInTheDocument();
    expect(screen.getByText("NONE habit")).toBeInTheDocument();
    expect(screen.queryByText("ENTJ")).toBeNull();
    expect(screen.getByText("MBTI disclaimer")).toBeInTheDocument();
  });
});
