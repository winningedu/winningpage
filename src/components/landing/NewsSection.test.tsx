import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import NewsSection from "./NewsSection";

vi.mock("@/config/site", () => ({
  site: { brandName: "스쿨멘토" },
}));

// QA 행109(2026-09-07 시안 4885:19030) — 필터 탭 제거, 열당 최대 5행.
function makeItems(
  count: number,
  {
    prefix = "소식",
    pinnedIds = [],
  }: { prefix?: string; pinnedIds?: string[] } = {},
) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `${prefix} 제목 ${i + 1}`,
    created_at: "2026-09-01T00:00:00.000Z",
    is_pinned: pinnedIds.includes(`${prefix}-${i + 1}`),
  }));
}

function renderSection(
  props: Partial<React.ComponentProps<typeof NewsSection>> = {},
) {
  return render(
    <MemoryRouter>
      <NewsSection {...props} />
    </MemoryRouter>,
  );
}

describe("NewsSection", () => {
  test("필터 탭(tablist)을 렌더하지 않는다", () => {
    renderSection({
      companyNews: makeItems(3, { prefix: "회사소식" }),
      notices: makeItems(3, { prefix: "공지" }),
    });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  test("각 열은 받은 순서 그대로 최대 5행만 렌더한다", () => {
    renderSection({
      companyNews: makeItems(7, { prefix: "회사소식" }),
      notices: makeItems(7, { prefix: "공지" }),
    });

    expect(screen.getByText("회사소식 제목 1")).toBeInTheDocument();
    expect(screen.getByText("회사소식 제목 5")).toBeInTheDocument();
    expect(screen.queryByText("회사소식 제목 6")).not.toBeInTheDocument();
    expect(screen.queryByText("회사소식 제목 7")).not.toBeInTheDocument();
  });

  test("is_pinned 행만 '중요' 배지를 노출한다", () => {
    renderSection({
      companyNews: makeItems(3, {
        prefix: "회사소식",
        pinnedIds: ["회사소식-2"],
      }),
      notices: [],
    });

    expect(screen.getAllByText("중요")).toHaveLength(1);
  });

  test("빈 상태 메시지는 필터 라벨 없이 고정 문구를 쓴다", () => {
    renderSection({ companyNews: [], notices: [] });

    expect(screen.getByText("등록된 회사소식이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("등록된 공지사항이 없습니다.")).toBeInTheDocument();
  });

  test("헤딩·aria-label에 site.brandName을 쓴다", () => {
    renderSection({ companyNews: [], notices: [] });

    expect(screen.getByText("스쿨멘토의 새로운 소식")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "스쿨멘토 소식" }),
    ).toBeInTheDocument();
  });
});
