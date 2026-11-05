// 칼럼 홈의 빈 안내는 사이트별 설정(columnTitle)의 게시판 이름을 쓴다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ title: "교육칼럼", rows: [] as unknown[] }));

vi.mock("@/config/site", () => ({
  site: {
    get columnTitle() {
      return state.title;
    },
  },
}));
vi.mock("./columnData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./columnData")>();
  return {
    ...actual,
    fetchActiveColumns: async () => state.rows,
    fetchColumnCategories: async () => [],
  };
});

import ColumnHome from "./ColumnHome";

function renderHome() {
  render(
    <MemoryRouter>
      <ColumnHome />
    </MemoryRouter>,
  );
}

describe("ColumnHome 빈 안내", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it.each([
    ["교육칼럼", "등록된 교육칼럼이 없습니다."],
    ["칼럼-교육청소식", "등록된 칼럼-교육청소식이 없습니다."],
  ])("%s: 글이 하나도 없으면 안내한다", async (title, text) => {
    state.title = title;
    renderHome();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    ["교육칼럼", "등록된 교육칼럼이 없습니다."],
    ["칼럼-교육청소식", "등록된 칼럼-교육청소식이 없습니다."],
  ])("%s: 목록 영역이 비면 안내한다", async (title, text) => {
    state.title = title;
    state.rows = [{ id: "1", title: "A글", category: "교육청소식" }];
    renderHome();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
