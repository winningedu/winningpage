import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  news: {
    companyTitle: "회사소식",
    companyEmpty: "등록된 회사소식이 없습니다.",
  },
}));

vi.mock("@/config/site", () => ({
  site: {
    get news() {
      return state.news;
    },
  },
}));
vi.mock("@/pages/board/boardData", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/pages/board/boardData")>();
  return {
    ...actual,
    fetchBoardRows: async () => ({ rows: [], total: 0 }),
  };
});

import CompanyNewsList from "./CompanyNewsList";

function renderList() {
  render(
    <MemoryRouter>
      <CompanyNewsList />
    </MemoryRouter>,
  );
}

describe("CompanyNewsList 게시판 이름", () => {
  beforeEach(() => {
    state.news = {
      companyTitle: "회사소식",
      companyEmpty: "등록된 회사소식이 없습니다.",
    };
  });

  it("위닝은 제목, 검색 라벨, 빈 안내가 기존 문구 그대로다", async () => {
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "회사소식" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("회사소식 검색")).toBeInTheDocument();
    expect(
      await screen.findByText("등록된 회사소식이 없습니다."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 공지-회사소개 제목과 작성된 글이 없어요를 보인다", async () => {
    state.news = {
      companyTitle: "공지-회사소개",
      companyEmpty: "작성된 글이 없어요",
    };
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "공지-회사소개" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("공지-회사소개 검색")).toBeInTheDocument();
    expect(await screen.findByText("작성된 글이 없어요")).toBeInTheDocument();
  });
});
