import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import AcceptanceSection from "./AcceptanceSection";
import HeroSection from "./HeroSection";
import PatentBadge from "./PatentBadge";
import ServicesSection from "./ServicesSection";

// QA3 행67, 랜딩 섹션 간격, 행간 축소. 핵심 클래스만 확인한다.
describe("랜딩 섹션 간격", () => {
  test("합격생 섹션 제목 행간이 leading-[1.25]로 좁혀진다", () => {
    render(
      <MemoryRouter>
        <AcceptanceSection
          titleMain="큰제목"
          titleSub="중제목"
          universities={[
            { id: "u-1", name: "서울대학교", track: "general", sort_order: 1 },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveClass(
      "leading-[1.25]",
    );
  });

  test("핵심 서비스 섹션 상단 여백이 lg:pt-17로 좁혀진다", () => {
    render(
      <MemoryRouter>
        <ServicesSection
          services={[
            {
              id: "s1",
              name: "학습진단",
              description: "설명",
              link: "/services/learning-diagnosis",
              icon_image_url: "/x.png",
              sort_order: 1,
            },
          ]}
        />
      </MemoryRouter>,
    );
    const wrapper = screen.getByRole("region", {
      name: "핵심 서비스",
    }).firstElementChild;
    expect(wrapper).toHaveClass("lg:pt-17");
  });
});

// 홈 배너 위 여백 축소(2026-11-10), 위닝과 스쿨멘토 공통.
describe("히어로 배너 위 여백", () => {
  test("배너 위 상단 패딩은 lg:pt-18이고 1632px 이상에서 3rem으로 더 줄어든다", () => {
    render(
      <MemoryRouter>
        <HeroSection showMainEmptyNotice />
      </MemoryRouter>,
    );
    const container = screen.getByRole("region", {
      name: "메인 히어로",
    }).firstElementChild;
    expect(container).toHaveClass(
      "lg:pt-18",
      "min-[102rem]:pt-12",
      "py-8",
      "lg:pb-0",
    );
    expect(container).not.toHaveClass("lg:pt-30");
    expect(container).not.toHaveClass("lg:pt-22");
  });

  test("특허 배지는 lg에서 헤더 아래 0.5rem(lg:top-18)에 놓인다", () => {
    const { container } = render(<PatentBadge />);
    expect(container.firstElementChild).toHaveClass("lg:top-18");
    expect(container.firstElementChild).not.toHaveClass("lg:top-20");
  });
});
