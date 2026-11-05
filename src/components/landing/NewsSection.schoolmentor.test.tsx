// 스쿨멘토 새로운 소식(사 #33, #34, #86, #88): 두 목록 제목은 공지-회사소개, 교육-정보안내이고
// 각 목록은 최신 4건, 글이 없으면 '작성된 글이 없어요'를 보여준다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    news: {
      maxRows: 4,
      companyTitle: "공지-회사소개",
      noticeTitle: "교육-정보안내",
      companyEmpty: "작성된 글이 없어요",
      noticeEmpty: "작성된 글이 없어요",
    },
  },
}));

const { default: NewsSection } = await import("./NewsSection");

function makeItems(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `${prefix} 제목 ${i + 1}`,
    created_at: "2026-09-01T00:00:00.000Z",
    is_pinned: false,
  }));
}

function renderSection(props: React.ComponentProps<typeof NewsSection> = {}) {
  return render(
    <MemoryRouter>
      <NewsSection {...props} />
    </MemoryRouter>,
  );
}

describe("NewsSection - 스쿨멘토", () => {
  test("두 목록 제목은 공지-회사소개, 교육-정보안내다", () => {
    renderSection();

    expect(screen.getByText("공지-회사소개")).toBeInTheDocument();
    expect(screen.getByText("교육-정보안내")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "공지-회사소개 더보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "교육-정보안내 더보기" }),
    ).toBeInTheDocument();
  });

  test("각 목록은 받은 순서 그대로 4건만 보여준다", () => {
    renderSection({
      companyNews: makeItems(6, "회사"),
      notices: makeItems(6, "교육"),
    });

    expect(screen.getByText("회사 제목 4")).toBeInTheDocument();
    expect(screen.queryByText("회사 제목 5")).not.toBeInTheDocument();
    expect(screen.getByText("교육 제목 4")).toBeInTheDocument();
    expect(screen.queryByText("교육 제목 5")).not.toBeInTheDocument();
  });

  test("글이 없으면 두 목록 모두 '작성된 글이 없어요'를 보여준다", () => {
    renderSection();

    expect(screen.getAllByText("작성된 글이 없어요")).toHaveLength(2);
  });
});
