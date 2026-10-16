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

describe("LearningDiagnosisLanding 히어로", () => {
  it("히어로에는 영상 보기 버튼 없이 시작하기 버튼만 있다", () => {
    renderPage();
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero).not.toBeNull();
    const links = hero!.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("지금 시작하기");
    expect(hero).not.toHaveTextContent("학습진단 영상 보기");
  });

  it("CTA 버튼과 리포트 이미지 쌍은 가로 flex 래퍼를 공유하지 않는다", () => {
    renderPage();
    const cta = screen.getByRole("link", { name: "지금 시작하기" });
    const image = screen.getByAltText("학습진단 리포트 1페이지 미리보기");
    const shared = cta.parentElement;
    expect(shared).not.toBeNull();
    expect(shared!.contains(image)).toBe(true);
    expect(shared!.className).not.toContain("sm:flex-row");
  });

  it("하단 CTA는 시작하기와 영상 보기 두 버튼을 한 줄에 둔다", () => {
    renderPage();
    const start = screen.getByRole("link", { name: /학습진단 시작하기/ });
    const video = screen.getByRole("link", { name: /학습진단 영상 보기/ });
    expect(start.parentElement).toBe(video.parentElement);
    expect(start.parentElement!.className).toContain("sm:flex-row");
  });

  it("시작하기 화살표는 문자가 아니라 숨겨진 아이콘이다", () => {
    renderPage();
    const start = screen.getByRole("link", { name: /학습진단 시작하기/ });
    expect(start.textContent).not.toContain("\u2192");
    expect(start.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
