// 스쿨멘토 칼럼 목록의 유형 칩(전체, 영상, 칼럼)은 카테고리, 검색과 함께 거른다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ video: true, rows: [] as unknown[] }));

vi.mock("@/config/site", () => ({
  site: {
    columnTitle: "칼럼-교육청소식",
    boardEmpty: "작성된 글이 없어요",
    get features() {
      return { columnVideo: state.video };
    },
  },
}));
vi.mock("./columnData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./columnData")>();
  return {
    ...actual,
    fetchActiveColumns: async () => state.rows,
    fetchColumnCategories: async () => ["학습", "입시"],
  };
});

import ColumnList from "./ColumnList";

const VIDEO = "https://youtu.be/abcDEF12345";

beforeEach(() => {
  state.video = true;
  state.rows = [
    { id: "1", title: "영상A", category: "학습", link_url: VIDEO },
    { id: "2", title: "영상B", category: "입시", link_url: VIDEO },
    { id: "3", title: "칼럼C", category: "학습" },
    { id: "4", title: "링크D", category: "학습", link_url: "https://a.com" },
  ];
});

function renderList() {
  render(
    <MemoryRouter>
      <ColumnList />
    </MemoryRouter>,
  );
}

describe("ColumnList 유형 칩", () => {
  it("영상을 누르면 유튜브 글만 보인다", async () => {
    renderList();
    await screen.findByText("영상A");
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    expect(screen.getByText("영상A")).toBeInTheDocument();
    expect(screen.getByText("영상B")).toBeInTheDocument();
    expect(screen.queryByText("칼럼C")).not.toBeInTheDocument();
    expect(screen.queryByText("링크D")).not.toBeInTheDocument();
  });

  it("칼럼을 누르면 유튜브가 아닌 글만 보인다", async () => {
    renderList();
    await screen.findByText("영상A");
    fireEvent.click(screen.getByRole("button", { name: "칼럼" }));
    expect(screen.queryByText("영상A")).not.toBeInTheDocument();
    expect(screen.getByText("칼럼C")).toBeInTheDocument();
    expect(screen.getByText("링크D")).toBeInTheDocument();
  });

  it("유형, 카테고리, 검색어가 함께 걸린다", async () => {
    renderList();
    await screen.findByText("영상A");
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "입시" }));
    expect(screen.queryByText("영상A")).not.toBeInTheDocument();
    expect(screen.getByText("영상B")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "없는" },
    });
    expect(screen.getByText("작성된 글이 없어요")).toBeInTheDocument();
  });

  it("전체 칩이 유형과 카테고리에 각각 있다", async () => {
    renderList();
    await screen.findByText("영상A");
    expect(screen.getAllByRole("button", { name: "전체" })).toHaveLength(2);
  });

  it("위닝은 유형 칩이 없다", async () => {
    state.video = false;
    renderList();
    await screen.findByText("영상A");
    expect(screen.queryByRole("button", { name: "영상" })).toBeNull();
    expect(screen.queryByRole("button", { name: "칼럼" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "전체" })).toHaveLength(1);
  });
});
