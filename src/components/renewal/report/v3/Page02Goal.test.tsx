import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page02Goal from "./Page02Goal";
import { FRONT_PAGES } from "./testPages";

const p2 = FRONT_PAGES.p2;

describe("Page02Goal", () => {
  it("marks the chosen step of the 6-step specificity bar and shows the target", () => {
    const { container } = render(<Page02Goal page={p2} tocTitle="목표 진단" />);
    const steps = container.querySelectorAll("[data-step]");
    expect(steps).toHaveLength(6);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/고려대학교/)).toHaveTextContent("경제학과");
    expect(screen.getByText("2 / 16")).toBeInTheDocument();
  });

  it("shows reason chips with intrinsic and extrinsic counts, and hides them when q3r was hidden", () => {
    const { rerender } = render(<Page02Goal page={p2} tocTitle="목표 진단" />);
    expect(screen.getByText("희망 직업과 연결되어 있어서")).toBeInTheDocument();
    expect(screen.getByText("내재 동기").nextSibling).toHaveTextContent("2");
    const { reasons: _r, ...noReasons } = p2;
    rerender(<Page02Goal page={noReasons} tocTitle="목표 진단" />);
    expect(screen.queryByText("희망 직업과 연결되어 있어서")).toBeNull();
    expect(screen.queryByText("내재 동기")).toBeNull();
  });

  it("highlights the matrix cell, and none for NA", () => {
    const { container, rerender } = render(
      <Page02Goal page={p2} tocTitle="목표 진단" />,
    );
    const current = container.querySelectorAll(
      '[data-cell][aria-current="true"]',
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-cell", "C_IN");
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(6);
    const { highlighted: _h, ...matrix } = p2.matrix;
    rerender(<Page02Goal page={{ ...p2, matrix }} tocTitle="목표 진단" />);
    expect(
      container.querySelector('[data-cell][aria-current="true"]'),
    ).toBeNull();
  });

  it("shows the NA name and desc as the matrix note when the cell is NA", () => {
    const { highlighted: _h, ...rest } = p2.matrix;
    render(
      <Page02Goal
        page={{
          ...p2,
          matrix: { ...rest, note: { name: "NA name", desc: "NA desc" } },
        }}
        tocTitle="목표 진단"
      />,
    );
    expect(screen.getByText("NA name")).toBeInTheDocument();
    expect(screen.getByText("NA desc")).toBeInTheDocument();
  });

  it("fills ladder rungs from the payload and shows ladder text and tips", () => {
    const { container } = render(<Page02Goal page={p2} tocTitle="목표 진단" />);
    const rungs = container.querySelectorAll("[data-rung]");
    expect(rungs).toHaveLength(3);
    expect(rungs[0]).toHaveAttribute("data-filled", "true");
    expect(rungs[2]).toHaveAttribute("data-filled", "false");
    // spec row 60: an empty rung reads 「비어 있음」 on the page, not only to screen readers
    const empty = screen.getByText("비어 있음");
    expect(rungs[2]).toContainElement(empty);
    expect(empty).not.toHaveClass("sr-only");
    expect(screen.getByText(p2.ladder.text)).toBeInTheDocument();
    for (const tip of p2.tips)
      expect(screen.getByText(tip)).toBeInTheDocument();
  });
});
