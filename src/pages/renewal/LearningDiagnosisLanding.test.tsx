import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import LearningDiagnosisLanding from "./LearningDiagnosisLanding";

function renderPage() {
  render(
    <MemoryRouter>
      <LearningDiagnosisLanding />
    </MemoryRouter>,
  );
}

describe("LearningDiagnosisLanding 하단 CTA", () => {
  it("학습진단 시작하기 링크는 설문으로 이동한다", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: /학습진단 시작하기/ }),
    ).toHaveAttribute("href", "/app/learning-diagnosis/survey");
  });

  it("학습진단 영상 보기 링크는 유튜브를 새 탭으로 열고 새 창을 예고한다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /학습진단 영상 보기/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=zEGJwwNdqbc",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("(새 창)");
  });
});
