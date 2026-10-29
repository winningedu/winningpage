import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  CONDENSE_SCROLL_TOP_PX,
  EXPAND_SCROLL_TOP_PX,
  useCondensedByScrollTop,
} from "./useCondensedByScrollTop";

function TestComponent() {
  const { isCondensed, onScrollCapture } = useCondensedByScrollTop();
  return (
    <div onScrollCapture={onScrollCapture}>
      <div data-testid="scroller" />
      <span data-testid="state">{isCondensed ? "condensed" : "expanded"}</span>
    </div>
  );
}

function scrollTo(top: number) {
  const scroller = screen.getByTestId("scroller");
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
}

const state = () => screen.getByTestId("state").textContent;
const BETWEEN = (CONDENSE_SCROLL_TOP_PX + EXPAND_SCROLL_TOP_PX) / 2;

describe("useCondensedByScrollTop", () => {
  test("starts expanded", () => {
    render(<TestComponent />);
    expect(state()).toBe("expanded");
  });

  test("condenses once scrollTop reaches the condense threshold", () => {
    render(<TestComponent />);
    scrollTo(CONDENSE_SCROLL_TOP_PX);
    expect(state()).toBe("condensed");
  });

  test("stays expanded between thresholds", () => {
    render(<TestComponent />);
    scrollTo(BETWEEN);
    expect(state()).toBe("expanded");
  });

  test("stays condensed between thresholds after condensing (content shrink)", () => {
    render(<TestComponent />);
    scrollTo(CONDENSE_SCROLL_TOP_PX);
    scrollTo(BETWEEN);
    expect(state()).toBe("condensed");
  });

  test("expands only at or below the expand threshold", () => {
    render(<TestComponent />);
    scrollTo(CONDENSE_SCROLL_TOP_PX);
    scrollTo(EXPAND_SCROLL_TOP_PX);
    expect(state()).toBe("expanded");
  });
});
