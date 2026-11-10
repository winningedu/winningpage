// 칼럼 게시판 이름은 사이트별 설정(columnTitle)을 따른다. 위닝은 '교육칼럼', 스쿨멘토는 '칼럼-교육청소식'.
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
    get boardEmpty() {
      return state.title === "교육칼럼" ? undefined : "작성된 글이 없어요";
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

import ColumnList from "./ColumnList";

function renderList() {
  render(
    <MemoryRouter>
      <ColumnList />
    </MemoryRouter>,
  );
}

describe("ColumnList 게시판 이름", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("위닝은 제목과 빈 안내에 교육칼럼을 쓴다", async () => {
    state.title = "교육칼럼";
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "교육칼럼" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("등록된 교육칼럼이 없습니다."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 제목과 빈 안내에 칼럼-교육청소식을 쓴다", async () => {
    state.title = "칼럼-교육청소식";
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "칼럼-교육청소식" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("작성된 글이 없어요")).toBeInTheDocument();
  });
});
