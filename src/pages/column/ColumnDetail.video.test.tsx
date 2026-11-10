import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchColumnById = vi.fn();
const siteState = vi.hoisted(() => ({ columnVideo: true }));

vi.mock("@/config/site", () => ({
  get site() {
    return {
      columnTitle: "칼럼",
      features: { columnVideo: siteState.columnVideo },
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
  default: () => <div>본문 내용</div>,
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

const youtube = "https://www.youtube.com/watch?v=abcDEF12345";

describe("ColumnDetail 유튜브 재생", () => {
  beforeEach(() => {
    fetchColumnById.mockReset();
    siteState.columnVideo = true;
  });

  it("스쿨멘토에서 유튜브 글은 플레이어와 본문을 보이고 바로가기는 없다", async () => {
    fetchColumnById.mockResolvedValue({
      id: "7",
      title: "영상 글",
      link_url: youtube,
    });
    renderDetail();
    const frame = await screen.findByTitle("영상 글", {
      selector: "iframe",
    });
    expect(frame.getAttribute("src")).toContain(
      "https://www.youtube-nocookie.com/embed/abcDEF12345?",
    );
    expect(frame.getAttribute("src")).toContain("enablejsapi=1");
    expect(frame.getAttribute("src")).not.toContain("autoplay");
    expect(screen.getByText("본문 내용")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /바로가기/ })).toBeNull();
  });

  it("스쿨멘토에서 유튜브가 아닌 연결주소는 바로가기를 보인다", async () => {
    fetchColumnById.mockResolvedValue({
      id: "7",
      title: "외부 글",
      link_url: "https://blog.naver.com/x",
    });
    renderDetail();
    expect(
      await screen.findByRole("link", { name: /바로가기/ }),
    ).toHaveAttribute("href", "https://blog.naver.com/x");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("위닝에서는 유튜브 글도 바로가기를 보이고 플레이어는 없다", async () => {
    siteState.columnVideo = false;
    fetchColumnById.mockResolvedValue({
      id: "7",
      title: "영상 글",
      link_url: youtube,
    });
    renderDetail();
    expect(
      await screen.findByRole("link", { name: /바로가기/ }),
    ).toHaveAttribute("href", youtube);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
