import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { SummaryItem, SummaryResponse } from "./api";
import SummaryTab from "./SummaryTab";

const base: SummaryItem = {
  day: "2026-10-07",
  service: "growth",
  calls: 10,
  okCalls: 9,
  errorCalls: 1,
  retriedCalls: 0,
  failureRate: 10,
  retryRate: 0,
  cachedRatio: null,
  promptTokens: 100,
  outputTokens: 50,
  cachedTokens: 0,
  thoughtsTokens: 0,
  p50Ms: 100,
  p95Ms: 300,
  costUsd: null,
  models: [],
};

function data(items: SummaryItem[]): SummaryResponse {
  const { day: _day, service: _service, ...totals } = base;
  return {
    from: "2026-10-01",
    to: "2026-10-07",
    items,
    totals,
    pricingConfigured: true,
  };
}

function smallCards() {
  return document.querySelectorAll('[data-slot="card"][data-size="sm"]');
}

describe("SummaryTab", () => {
  test("합계 타일 6개와 차트 2개를 작은 Card 로 그린다", () => {
    render(<SummaryTab data={data([base])} />);
    expect(smallCards().length).toBe(8);
    expect(screen.getByText("일별 호출 수")).toBeTruthy();
    expect(screen.getByText("일별 금액 합계 USD")).toBeTruthy();
    expect(screen.getByText("호출 수")).toBeTruthy();
  });

  test("호출이 없으면 합계 타일만 Card 로 그린다", () => {
    render(<SummaryTab data={data([])} />);
    expect(smallCards().length).toBe(6);
  });

  test("일별 표의 열 머리글은 scope col 이다", () => {
    render(<SummaryTab data={data([base])} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBe(13);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });
});

function expectNumericColumn(table: HTMLElement, name: string) {
  const headers = within(table).getAllByRole("columnheader");
  const index = headers.findIndex((h) =>
    h.textContent?.trim().startsWith(name),
  );
  expect(index, name).toBeGreaterThanOrEqual(0);
  expect(headers[index]).toHaveClass("text-right");
  const cells = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[index]);
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    expect(cell).toHaveClass("text-right", "tabular-nums");
  }
}

test("일별 표의 숫자 열은 머리글과 셀 모두 오른쪽 정렬, 셀은 고정폭 숫자다", () => {
  render(<SummaryTab data={data([base])} />);
  const table = screen.getByRole("table");
  for (const name of [
    "호출",
    "실패율",
    "재요청률",
    "prompt",
    "output",
    "cached",
    "thoughts",
    "캐시 비율",
    "p50 ms",
    "p95 ms",
    "금액 USD",
  ]) {
    expectNumericColumn(table, name);
  }
});
