// 매출 총괄 대시보드의 카드 구조와 집계 표 머리글.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import RevenueDashboard from "./RevenueDashboard";

afterEach(cleanup);

function renderDashboard() {
  render(
    <RevenueDashboard
      rows={[]}
      pending={{ approvalWaiting: 2, processWaiting: 0 }}
      toKstYmd={(date) => date.toISOString().slice(0, 10)}
      periodLabel="2026-11-01 ~ 2026-11-20"
    />,
  );
}

test("KPI 타일은 작은 카드다", () => {
  renderDashboard();

  const cards = document.querySelectorAll('[data-slot="card"][data-size="sm"]');
  expect(cards.length).toBeGreaterThanOrEqual(5);
});

test("항목별 집계 요약의 머리글은 열 머리글이다", () => {
  renderDashboard();

  for (const name of ["항목", "건수", "금액"]) {
    expect(screen.getByRole("columnheader", { name })).toHaveAttribute(
      "scope",
      "col",
    );
  }
});
