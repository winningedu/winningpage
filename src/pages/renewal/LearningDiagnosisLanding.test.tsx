import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    const image = screen.getByRole("img", { name: /16개 영역 리포트/ });
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

// QA4 28번: 가장 큰 두 간격(15rem 이상)을 성장설계 소개 페이지 기준(8.375rem)으로 맞춘다.
describe("LearningDiagnosisLanding 섹션 간격", () => {
  it.each([
    "이런 학생에게 학습 진단을 추천해요",
    "학습진단으로 얻을 수 있는 것",
  ])("%s 섹션 위 간격은 성장설계와 같은 8.375rem이다", (heading) => {
    renderPage();
    const section = screen
      .getByRole("heading", { name: heading })
      .closest("section");
    expect(section).toHaveClass("md:pt-33.5");
    expect(section?.className).not.toMatch(/md:pt-(60|62\.5)/);
  });
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("LearningDiagnosisLanding 히어로 16개 영역 리포트", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("새 히어로 문구와 NEW 배지, 안내 문구를 보여 준다", () => {
    renderPage();
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(within(hero).getByText("학습진단")).toBeInTheDocument();
    expect(
      within(hero).getByText("학습진단으로 나의 강점과 약점을 찾아드려요"),
    ).toBeInTheDocument();
    const emphasis = within(hero).getByText("16가지 분석 결과");
    expect(emphasis.tagName).toBe("STRONG");
    expect(emphasis.parentElement).toHaveTextContent(
      "목표대학 입결 비교, MBTI 학습궁합 등 16가지 분석 결과를 한 권의 리포트로 받아보세요",
    );
    expect(within(hero).getByText("NEW")).toBeInTheDocument();
    expect(
      within(hero).getByText("16개 영역의 전문리포트로 업그레이드되었어요"),
    ).toBeInTheDocument();
    expect(
      within(hero).getByText(
        "회원가입만 해도 전문리포트를 우선 받아볼 수 있어요",
      ),
    ).toBeInTheDocument();
  });

  it("리포트 페이지 16장을 장식 이미지로 펼쳐 둔다", () => {
    renderPage();
    const fan = screen.getByRole("img", { name: /16개 영역 리포트/ });
    const pages = fan.querySelectorAll("img");
    expect(pages).toHaveLength(16);
    for (const page of pages) expect(page).toHaveAttribute("alt", "");
    expect(fan).toHaveTextContent("01");
    expect(fan).toHaveTextContent("16");
  });

  it("동작 줄이기 설정이면 처음부터 펼친 상태로 그린다", () => {
    stubReducedMotion(true);
    renderPage();
    expect(
      screen.getByRole("img", { name: /16개 영역 리포트/ }),
    ).toHaveAttribute("data-fan", "spread");
  });

  it("동작 줄이기 설정이 아니면 겹친 상태에서 시작한다", () => {
    stubReducedMotion(false);
    renderPage();
    expect(
      screen.getByRole("img", { name: /16개 영역 리포트/ }),
    ).toHaveAttribute("data-fan", "stacked");
  });
});

describe("LearningDiagnosisLanding 결과리포트 목차", () => {
  it("16개 항목을 순서대로 보여 주고 핵심 표시는 01, 04, 07, 08, 11에만 단다", () => {
    renderPage();
    const section = screen
      .getByRole("heading", {
        name: "학습진단 결과리포트에는 이런 내용이 담겨요",
      })
      .closest("section")!;
    expect(section).toHaveTextContent(
      "학습 상태부터 4주 실행 플랜까지 한 권으로",
    );
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(16);
    expect(items[0]).toHaveTextContent(
      "01진단 요약종합 점수와 핵심 3가지를 한눈에",
    );
    expect(items[15]).toHaveTextContent(
      "16추천 서비스와 다음 단계결과에 맞는 서비스, 재진단 안내",
    );
    const starred = items
      .map((item, index) =>
        within(item).queryByRole("img", { name: "핵심 분석" })
          ? index + 1
          : null,
      )
      .filter((n) => n !== null);
    expect(starred).toEqual([1, 4, 7, 8, 11]);
  });
});
