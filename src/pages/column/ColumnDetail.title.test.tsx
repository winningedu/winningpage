// 칼럼 상세의 게시판 이름(상단 링크, 찾을 수 없음 화면의 홈 링크)은 사이트별 설정(columnTitle)을 따른다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ title: "교육칼럼" }));
const fetchColumnById = vi.fn();

vi.mock("@/config/site", () => ({
  site: {
    get columnTitle() {
      return state.title;
    },
    features: { columnVideo: false },
  },
}));
vi.mock("./columnData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./columnData")>();
  return {
    ...actual,
    fetchColumnById: (...args: unknown[]) => fetchColumnById(...args),
    fetchActiveColumns: async () => [],
    fetchColumnCategories: async () => [],
  };
});
vi.mock("@/components/column/ColumnBody", () => ({
  default: () => <div />,
  hasBlockContent: () => false,
}));

import ColumnDetail from "./ColumnDetail";

function renderDetail() {
  render(
    <MemoryRouter initialEntries={["/info/column/7"]}>
      <Routes>
        <Route path="/info/column/:id" element={<ColumnDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ColumnDetail 게시판 이름", () => {
  beforeEach(() => fetchColumnById.mockReset());

  it.each([["교육칼럼"], ["칼럼-교육청소식"]])(
    "%s: 상단 링크와 홈으로 링크에 쓴다",
    async (title) => {
      state.title = title;
      fetchColumnById.mockResolvedValue({ id: "7", title: "제목" });
      renderDetail();
      expect(await screen.findByRole("link", { name: title })).toHaveAttribute(
        "href",
        "/info/column",
      );
    },
  );

  it.each([["교육칼럼"], ["칼럼-교육청소식"]])(
    "%s: 글이 없으면 홈으로 링크에 쓴다",
    async (title) => {
      state.title = title;
      fetchColumnById.mockResolvedValue(null);
      renderDetail();
      expect(
        await screen.findByRole("link", { name: `${title} 홈으로` }),
      ).toBeInTheDocument();
    },
  );
});
