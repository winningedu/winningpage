import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { CitationItem } from "./api";
import CitationsTab from "./CitationsTab";

const item = (resourceId: string, citedCount: number): CitationItem => ({
  resourceId,
  title: `자료 ${resourceId}`,
  knowledgeType: "topic_pattern",
  isActive: true,
  hitCount: 3,
  citedCount,
  lastHitAt: null,
  lastCitedAt: null,
});

describe("CitationsTab", () => {
  test("열 머리글은 scope col 이고 정렬 버튼이 순서를 바꾼다", () => {
    render(<CitationsTab items={[item("a", 5), item("b", 1)]} />);
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header.getAttribute("scope")).toBe("col");
    }
    const titles = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent);
    expect(titles()[0]).toContain("자료 b");
    fireEvent.click(screen.getByRole("button", { name: "인용 적은 순" }));
    expect(titles()[0]).toContain("자료 a");
  });

  test("자료가 없으면 빈 문구를 보여 준다", () => {
    render(<CitationsTab items={[]} />);
    expect(screen.getByText("조회된 자료가 없습니다.")).toBeTruthy();
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

test("인용 표의 횟수 열은 머리글과 셀 모두 오른쪽 정렬, 셀은 고정폭 숫자다", () => {
  render(<CitationsTab items={[item("a", 5)]} />);
  const table = screen.getByRole("table");
  for (const name of ["적중 횟수", "인용 횟수"]) {
    expectNumericColumn(table, name);
  }
});
