import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FRONT_PAGES } from "../testPages";
import RadarChart7 from "./RadarChart7";

const stages = FRONT_PAGES.p4.cycle.stages;

describe("RadarChart7", () => {
  it("draws one labeled axis per stage with its score", () => {
    const { container } = render(<RadarChart7 axes={stages} />);
    expect(container.querySelectorAll("[data-axis]")).toHaveLength(7);
    expect(screen.getByText("우선순위")).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
  });

  it("draws the dashed target ring only when a target is given", () => {
    const { container, rerender } = render(<RadarChart7 axes={stages} />);
    expect(container.querySelector("[data-target-ring]")).toBeNull();
    rerender(<RadarChart7 axes={stages} target={75} />);
    expect(container.querySelector("[data-target-ring]")).toHaveAttribute(
      "stroke-dasharray",
    );
  });

  it("marks broken axes and says so in the accessible name", () => {
    const { container } = render(<RadarChart7 axes={stages} />);
    const broken = container.querySelectorAll(
      '[data-axis][data-broken="true"]',
    );
    expect(broken).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "우선순위 41 여기서 끊김",
    );
  });
});
