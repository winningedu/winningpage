import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SectionHeader from "./SectionHeader";

describe("SectionHeader", () => {
  it("shows the two-digit number, toc title, headline and lead", () => {
    render(
      <SectionHeader
        page={2}
        tocTitle="목표 진단"
        title="목표가 분명하고,<br>그 이유도 내 안에 있습니다."
        lead="안내문"
      />,
    );
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("목표 진단")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(
      "목표가 분명하고,그 이유도 내 안에 있습니다.",
    );
    expect(heading.querySelector("br")).not.toBeNull();
    expect(heading.textContent).not.toContain("<br>");
    expect(screen.getByText("안내문")).toBeInTheDocument();
  });
});
