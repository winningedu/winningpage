import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import AcceptanceSection from "./AcceptanceSection";
import ServicesSection from "./ServicesSection";

// QA3 행67 — 랜딩 섹션 간격·행간 축소. 핵심 클래스만 확인한다.
describe("랜딩 섹션 간격", () => {
  test("합격생 섹션 제목 행간이 leading-[1.25]로 좁혀진다", () => {
    render(
      <MemoryRouter>
        <AcceptanceSection
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
    const wrapper = screen.getByRole("region", { name: "핵심 서비스" })
      .firstElementChild;
    expect(wrapper).toHaveClass("lg:pt-17");
  });
});
