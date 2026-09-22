import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PremiumRoadmapDiagram from "./PremiumRoadmapDiagram";

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    logo: { stacked: "/images/schoolmentor-logo-stacked.png" },
  },
}));

describe("PremiumRoadmapDiagram — 사이트별 브랜드", () => {
  it("중앙 로고(데스크톱·모바일 2곳)가 site.logo.stacked·brandName을 쓴다", () => {
    render(<PremiumRoadmapDiagram pills={["1", "2", "3", "4", "5", "6"]} />);

    const logos = screen.getAllByAltText("스쿨멘토");
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      expect(logo).toHaveAttribute(
        "src",
        "/images/schoolmentor-logo-stacked.png",
      );
    }
  });
});
