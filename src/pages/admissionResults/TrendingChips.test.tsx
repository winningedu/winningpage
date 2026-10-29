import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TrendingChips from "./TrendingChips";

const items = [
  { key: "a", label: "활성칩", universityKey: "u", departmentKey: "d" },
  { key: "b", label: "비활성칩" },
];

describe("TrendingChips", () => {
  it("모든 칩 글씨는 font-semibold이다", () => {
    render(<TrendingChips items={items} />);
    for (const name of ["활성칩", "비활성칩"]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "font-semibold",
      );
    }
  });

  it("비활성 칩은 옅은 text-line 색을 쓰지 않는다", () => {
    render(<TrendingChips items={items} />);
    expect(
      screen.getByRole("button", { name: "비활성칩" }).className,
    ).not.toMatch(/text-line/);
  });
});
