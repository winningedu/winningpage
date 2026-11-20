import { render } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { CHART_COLORS } from "./chartTheme";
import Sparkline from "./Sparkline";

// jsdom에는 레이아웃이 없어 ResponsiveContainer가 크기 0으로 아무것도 그리지 않는다.
// 고정 크기를 주입해 차트가 실제로 그려지게 한다.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => cloneElement(children, { width: 400, height: 112 }),
  };
});

const makeSeries = () => [
  { year: 2022, value: 3, displayValue: "3.0" },
  { year: 2023, value: null, displayValue: "-" },
  { year: 2024, value: 2, displayValue: "2.0" },
];

function yearTick(container: HTMLElement, label: string) {
  const node = Array.from(
    container.querySelectorAll(".recharts-cartesian-axis-tick-label > text"),
  ).find((text) => text.textContent === label);
  if (!node) throw new Error(`year tick ${label} not rendered`);
  return node;
}

describe("Sparkline 연도 눈금", () => {
  test("같은 값으로 리렌더해도 눈금 DOM 노드가 다시 마운트되지 않는다", () => {
    const { container, rerender } = render(<Sparkline series={makeSeries()} />);
    const before = yearTick(container, "22");

    rerender(<Sparkline series={makeSeries()} />);

    expect(before.isConnected).toBe(true);
    expect(yearTick(container, "22")).toBe(before);
  });

  test("값이 있는 연도는 label 색, 결측 연도는 grid 색이다", () => {
    const { container } = render(<Sparkline series={makeSeries()} />);

    expect(yearTick(container, "22").getAttribute("fill")).toBe(
      CHART_COLORS.label,
    );
    expect(yearTick(container, "23").getAttribute("fill")).toBe(
      CHART_COLORS.grid,
    );
  });
});
