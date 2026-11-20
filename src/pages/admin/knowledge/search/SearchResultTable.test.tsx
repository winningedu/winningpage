import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { SearchPreviewItem } from "../../../../../api/_lib/knowledge/preview.js";
import type { SearchPreviewResult } from "../api";
import SearchResultTable from "./SearchResultTable";

const item = (rank: number, passes: boolean): SearchPreviewItem => ({
  rank,
  id: `r${rank}`,
  title: `자료 ${rank}`,
  grade: "고2",
  subject: "물리",
  career_field: "공학",
  similarity: passes ? 0.8 : 0.3,
  passesThreshold: passes,
  wouldBeInjected: passes,
});

function renderTable(items: SearchPreviewItem[]) {
  const result: SearchPreviewResult = {
    mode: "vector",
    threshold: 0.5,
    queryText: "q",
    keywordQuery: null,
    items,
  };
  return render(<SearchResultTable result={result} />);
}

describe("SearchResultTable", () => {
  test("threshold 미달이 시작되는 자리에 경계선 줄을 그린다", () => {
    renderTable([item(1, true), item(2, false)]);
    expect(screen.getByText("여기부터 threshold 미달")).toBeTruthy();
    expect(screen.getByText("주입")).toBeTruthy();
    expect(screen.getByText("제외")).toBeTruthy();
  });

  test("결과가 없으면 빈 문구를 보여 준다", () => {
    renderTable([]);
    expect(
      screen.getByText(
        "검색된 카드가 없습니다. 임베딩이 끝난 사용 중 카드만 검색됩니다.",
      ),
    ).toBeTruthy();
  });

  test("모든 열 머리글이 scope col 이다", () => {
    renderTable([item(1, true)]);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBe(7);
    for (const header of headers) {
      expect(header.getAttribute("scope")).toBe("col");
    }
  });

  test("머리글은 스크롤 상자 안에서 고정되고 ui Table 래퍼 밖에 있다", () => {
    renderTable([item(1, true)]);
    const thead = screen.getAllByRole("columnheader")[0]?.closest("thead");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("top-0");
    expect(document.querySelector('[data-slot="table-container"]')).toBeNull();
  });
});
