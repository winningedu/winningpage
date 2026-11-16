// 칼럼 상세 커버 이미지는 사이트별 설정(columnCoverContained)이 켜지면 본문 폭 안에서 잘리지 않게 보인다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchColumnById = vi.fn();
const siteState = vi.hoisted(() => ({ contained: true }));

vi.mock("@/config/site", () => ({
  get site() {
    return {
      columnTitle: "칼럼",
      features: {
        columnVideo: false,
        columnCoverContained: siteState.contained,
      },
    };
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

const withCover = {
  id: "7",
  title: "커버 글",
  image_url: "https://example.com/cover.jpg",
};

describe("ColumnDetail 커버 이미지", () => {
  beforeEach(() => {
    fetchColumnById.mockReset();
    siteState.contained = true;
  });

  it("columnCoverContained가 켜지면 커버는 본문 폭 컨테이너 안에서 높이만 제한하고 자르지 않는다", async () => {
    fetchColumnById.mockResolvedValue(withCover);
    renderDetail();
    const img = await screen.findByRole("img", { name: "커버 글" });
    expect(img).toHaveClass("max-h-104");
    expect(img).not.toHaveClass("object-cover");
    expect(img).not.toHaveClass("w-full");
    expect(img.parentElement?.tagName).not.toBe("MAIN");
    expect(img.closest(".max-w-content")).not.toBeNull();
  });

  it("columnCoverContained가 꺼지면 커버는 기존 전체 폭 배너 그대로다", async () => {
    siteState.contained = false;
    fetchColumnById.mockResolvedValue(withCover);
    renderDetail();
    const img = await screen.findByRole("img", { name: "커버 글" });
    expect(img.parentElement?.tagName).toBe("MAIN");
    expect(img.className).toBe("h-104 w-full object-cover md:h-136");
  });

  it("커버가 없으면 플래그와 관계없이 커버 이미지 없이 자리 표시 블록만 보인다", async () => {
    fetchColumnById.mockResolvedValue({ id: "7", title: "커버 없는 글" });
    renderDetail();
    expect(await screen.findByText("커버 없는 글")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("main > div.h-104")).not.toBeNull();
  });
});
