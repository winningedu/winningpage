import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import PerformanceAssessment from "./PerformanceAssessment";

function renderPage() {
  render(
    <MemoryRouter>
      <PerformanceAssessment />
    </MemoryRouter>,
  );
}

describe("PerformanceAssessment 이용 방법 안내", () => {
  it("하단 섹션 제목이 수행평가 이용 방법 안내이고 가격 내용이 없다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "수행평가 이용 방법 안내",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/이용권 ?안내/)).toBeNull();
    expect(screen.queryByText("이용권 구매하러 가기")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d{1,3}(,\d{3})+\s*원/);
    expect(document.querySelector("#pricing")).toBeNull();
  });

  it("영상 보기 링크는 유튜브를 새 탭으로 열고 새 창을 예고한다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /수행평가 영상 보기/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=nloYdudqG-o",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("(새 창)");
  });
});
