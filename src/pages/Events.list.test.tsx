import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  news: {
    noticeTitle: "공지사항",
    noticeEmpty: "등록된 공지사항이 없습니다.",
  },
  boardBanners: undefined as
    | undefined
    | Record<
        "faq" | "info",
        { src: string; alt: string; width: number; height: number }
      >,
}));

vi.mock("@/config/site", () => ({
  site: {
    get news() {
      return state.news;
    },
    get boardBanners() {
      return state.boardBanners;
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
    state.boardBanners = undefined;
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

describe("Events 목록 상단 배너", () => {
  const INFO_ALT = "놓치면 안 될 교육 소식, 한곳에서 확인하세요";

  beforeEach(() => {
    state.news = {
      noticeTitle: "공지사항",
      noticeEmpty: "등록된 공지사항이 없습니다.",
    };
    state.boardBanners = undefined;
  });

  it("위닝은 배너 이미지를 렌더하지 않는다", async () => {
    renderList();
    await screen.findByText("등록된 공지사항이 없습니다.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("스쿨멘토는 제목 위에 교육정보 배너를 크기 속성과 함께 렌더한다", async () => {
    state.boardBanners = {
      faq: {
        src: "/images/faq-banner.png",
        alt: "다른 배너",
        width: 2400,
        height: 720,
      },
      info: {
        src: "/images/info-banner.png",
        alt: INFO_ALT,
        width: 2400,
        height: 720,
      },
    };
    renderList();
    await screen.findByText("등록된 공지사항이 없습니다.");
    const banner = screen.getByRole("img", { name: INFO_ALT });
    expect(banner).toHaveAttribute("src", "/images/info-banner.png");
    expect(banner).toHaveAttribute("width", "2400");
    expect(banner).toHaveAttribute("height", "720");
    expect(banner).toHaveAttribute("loading", "eager");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(
      banner.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
