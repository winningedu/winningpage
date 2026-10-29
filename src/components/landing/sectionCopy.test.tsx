import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import AcceptanceSection from "./AcceptanceSection";
import ServicesSection from "./ServicesSection";

const universities = [
  { id: "u-1", name: "서울대학교", track: "general" as const, sort_order: 1 },
];

describe("합격생 섹션 제목", () => {
  test("제목 props가 없으면 h2를 렌더하지 않는다", () => {
    render(
      <MemoryRouter>
        <AcceptanceSection universities={universities} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.getByRole("region", { name: "합격생" })).toBeInTheDocument();
  });

  test("큰제목과 중제목을 두 줄로 렌더한다", () => {
    render(
      <MemoryRouter>
        <AcceptanceSection
          universities={universities}
          titleMain="큰제목A"
          titleSub="중제목A"
        />
      </MemoryRouter>,
    );
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.children).toHaveLength(2);
    expect(h2.children[0]).toHaveTextContent("큰제목A");
    expect(h2.children[1]).toHaveTextContent("중제목A");
  });
});

const services = [
  {
    id: "s1",
    name: "학습진단",
    description: "설명",
    link: "/services/learning-diagnosis",
    icon_image_url: "/x.png",
    sort_order: 1,
  },
];

describe("핵심 서비스 섹션 제목", () => {
  test("제목 props가 없으면 라벨과 h2를 렌더하지 않는다", () => {
    render(
      <MemoryRouter>
        <ServicesSection services={services} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByText("핵심 서비스")).toBeNull();
  });

  test("라벨과 큰제목, 중제목을 렌더한다", () => {
    render(
      <MemoryRouter>
        <ServicesSection
          services={services}
          eyebrow="라벨S"
          titleMain="큰제목S"
          titleSub="중제목S"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("라벨S")).toBeInTheDocument();
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.children[0]).toHaveTextContent("큰제목S");
    expect(h2.children[1]).toHaveTextContent("중제목S");
  });
});
