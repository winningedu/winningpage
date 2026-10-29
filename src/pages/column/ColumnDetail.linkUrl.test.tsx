import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchColumnById = vi.fn();

vi.mock("./columnData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./columnData")>();
  return {
    ...actual,
    fetchColumnById: (...args: unknown[]) => fetchColumnById(...args),
    fetchActiveColumns: async () => [],
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

describe("ColumnDetail 바로가기", () => {
  beforeEach(() => fetchColumnById.mockReset());

  it("link_url이 있으면 새 창 바로가기 버튼을 보여준다", async () => {
    fetchColumnById.mockResolvedValue({
      id: "7",
      title: "제목",
      link_url: "https://youtu.be/abc",
    });
    renderDetail();
    const link = await screen.findByRole("link", { name: /바로가기/ });
    expect(link).toHaveAttribute("href", "https://youtu.be/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("link_url이 없으면 바로가기 버튼이 없다", async () => {
    fetchColumnById.mockResolvedValue({ id: "7", title: "제목" });
    renderDetail();
    await screen.findByRole("heading", { name: "제목" });
    expect(screen.queryByRole("link", { name: /바로가기/ })).toBeNull();
  });
});
