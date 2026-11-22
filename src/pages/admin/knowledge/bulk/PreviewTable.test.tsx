import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PreviewTable from "./PreviewTable";
import type { KnowledgeParseResult } from "./xlsx";

const parse = {
  inserts: [{ rowNo: 2, id: null, values: { title: "새 자료" } }],
  updates: [{ rowNo: 3, id: "r1", values: { title: "고친 자료" } }],
  errors: [{ rowNo: 4, reason: "제목이 비어 있습니다." }],
} as unknown as KnowledgeParseResult;

function renderTable(onToggle = vi.fn()) {
  return render(
    <PreviewTable
      parse={parse}
      dedupe={null}
      selected={new Set([2])}
      disabled={false}
      onToggle={onToggle}
    />,
  );
}

describe("PreviewTable", () => {
  test("오류 행과 반영 후보를 보여 주고 체크박스로 반영 여부를 바꾼다", () => {
    const onToggle = vi.fn();
    renderTable(onToggle);
    expect(screen.getByText("제목이 비어 있습니다.")).toBeTruthy();
    expect(screen.getByText("고친 자료")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "3행 반영" }));
    expect(onToggle).toHaveBeenCalledWith(3);
  });

  test("모든 열 머리글이 scope col 이다", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBe(7);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });

  test("반영 후보 표의 머리글은 스크롤 상자 안에서 고정되고 ui Table 래퍼 밖에 있다", () => {
    renderTable();
    const thead = screen
      .getByRole("columnheader", { name: "반영" })
      .closest("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("top-0");
    expect(document.querySelector('[data-slot="table-container"]')).toBeNull();
  });
});
