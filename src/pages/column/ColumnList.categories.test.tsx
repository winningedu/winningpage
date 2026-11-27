import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("./columnData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./columnData")>();
  return {
    ...actual,
    fetchActiveColumns: async () => [
      { id: "1", title: "A글", category: "교육청소식" },
      { id: "2", title: "B글", category: "삭제된 칩" },
    ],
    fetchColumnCategories: async () => ["교육청소식"],
  };
});

import ColumnList from "./ColumnList";

describe("ColumnList 카테고리 칩", () => {
  it("DB의 활성 카테고리가 전체 뒤에 칩으로 나온다", async () => {
    render(
      <MemoryRouter>
        <ColumnList />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "교육청소식" }),
    ).toBeInTheDocument();
    // 위닝도 칼럼 영상을 켜서 카테고리 칩과 유형 칩에 "전체"가 하나씩 있다.
    expect(screen.getAllByRole("button", { name: "전체" })).toHaveLength(2);
  });
});
