import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  news: {
    noticeTitle: "공지사항",
    noticeEmpty: "등록된 공지사항이 없습니다.",
  },
}));

vi.mock("@/config/site", () => ({
  site: {
    get news() {
      return state.news;
    },
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/pages/board/boardData", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/pages/board/boardData")>();
  return {
    ...actual,
    fetchBoardRows: async () => ({ rows: [], total: 0 }),
  };
});

import Events from "./Events";

function renderList() {
  render(
    <MemoryRouter>
      <Events />
    </MemoryRouter>,
  );
}

describe("Events 목록 게시판 이름", () => {
  beforeEach(() => {
    state.news = {
      noticeTitle: "공지사항",
      noticeEmpty: "등록된 공지사항이 없습니다.",
    };
  });

  it("위닝은 제목, 검색 라벨, 빈 안내가 기존 문구 그대로다", async () => {
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "공지사항" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("공지사항 검색")).toBeInTheDocument();
    expect(
      await screen.findByText("등록된 공지사항이 없습니다."),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 교육-정보안내 제목과 작성된 글이 없어요를 보인다", async () => {
    state.news = {
      noticeTitle: "교육-정보안내",
      noticeEmpty: "작성된 글이 없어요",
    };
    renderList();
    expect(
      screen.getByRole("heading", { level: 1, name: "교육-정보안내" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("교육-정보안내 검색")).toBeInTheDocument();
    expect(await screen.findByText("작성된 글이 없어요")).toBeInTheDocument();
  });
});
