import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CategoryChips from "./CategoryChips";

describe("CategoryChips", () => {
  it("전체를 맨 앞에 두고 받은 카테고리를 순서대로 그린다", () => {
    render(<CategoryChips categories={["B", "A"]} />);
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["전체", "B", "A"]);
  });

  it("카테고리가 비어 있으면 전체만 그린다", () => {
    render(<CategoryChips categories={[]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
