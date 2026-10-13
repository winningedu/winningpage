import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import InternationalSchool from "./InternationalSchool";

function renderPage() {
  return render(
    <MemoryRouter>
      <InternationalSchool />
    </MemoryRouter>,
  );
}

const FORBIDDEN = /[\u00b7\u2014\u2013\u2192\u2190]/;

describe("InternationalSchool", () => {
  it("히어로 제목과 상담 신청 링크를 렌더한다", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: /제주에서도 가능합니다/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("국제학교 학습관리 서비스")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "상담 신청하기" })).toHaveAttribute(
      "href",
      "/premium-apply",
    );
  });

  it.each([
    "국제학교의 배움을, 국내대학이 읽는 언어로",
    "제주국제학교 학생의 국내대학 진학, 왜 어려운가요?",
    "제주 국제학교 학생을 위한 국내대학 맞춤 프로그램",
    "국제학교 학생의 국내대학 진학 맞춤 컨설팅",
    "국내대학 진학, 위닝에듀 제주센터와 함께하세요",
  ])("h2 섹션 제목 %s 을 렌더한다", (name) => {
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  });

  it.each(["이런 학생에게 필요합니다", "과목별 수행평가 PLAN"])(
    "h3 소제목 %s 을 렌더한다",
    (name) => {
      renderPage();
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    },
  );

  it("프로그램 4카드, 이유 4항목, 대상 3항목, 플랜 3단계를 렌더한다", () => {
    renderPage();
    expect(screen.getByText("세특 키워드 설계")).toBeInTheDocument();
    expect(
      screen.getByText("학종 면접 대비 & 전략 컨설팅"),
    ).toBeInTheDocument();
    expect(screen.getByText("입시의 방향이 다릅니다")).toBeInTheDocument();
    expect(
      screen.getByText("비교과 관리에 공백이 생깁니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/상위권 대학과 의약학 계열을 목표로 하는 학생/),
    ).toBeInTheDocument();
    expect(screen.getByText("세특 연결 플랜")).toBeInTheDocument();
  });

  it("벤다이어그램은 이미지 역할 없이 h3 와 목록으로 렌더한다", () => {
    renderPage();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /설계/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /실행/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("FROM JEJU TO SKY")).toBeInTheDocument();
    expect(screen.getByText("학종 면접 대비")).toBeInTheDocument();
  });

  it("컨설팅 섹션 하단에 보장하지 않는다는 각주가 있다", () => {
    renderPage();
    expect(
      screen.getByText(/진학과 합격을 보장하지 않습니다/),
    ).toBeInTheDocument();
  });

  it("지도 링크는 새 창 외부 링크 속성과 스크린리더 안내를 가진다", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /제주센터 위치 보기/ });
    expect(link).toHaveAttribute(
      "href",
      "https://map.naver.com/v5/entry/place/1834412694",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("새 창");
  });

  it("렌더된 텍스트에 금지 문자가 없다", () => {
    const { container } = renderPage();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });
});
