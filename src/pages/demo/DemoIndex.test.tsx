import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import DemoIndex from "./DemoIndex";

function renderIndex() {
  return render(
    <MemoryRouter>
      <DemoIndex />
    </MemoryRouter>,
  );
}

describe("DemoIndex", () => {
  test("성장설계 소개 카드는 /demo/growth-intro 로 연결된다", () => {
    renderIndex();
    const link = screen.getByText("성장설계 소개").closest("a");
    expect(link?.getAttribute("href")).toBe("/demo/growth-intro");
  });

  test("정식 랜딩 경로 /services/growth 로 가는 링크는 없다", () => {
    renderIndex();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/services/growth");
  });
});
