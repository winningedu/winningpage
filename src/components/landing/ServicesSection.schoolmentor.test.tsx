import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ b2b: true }));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      premium: false,
      hiddenPrograms: [],
      get b2bMenu() {
        return state.b2b;
      },
    },
  },
}));

const { default: ServicesSection } = await import("./ServicesSection");

const services = [
  {
    id: "s1",
    name: "학습진단",
    link: "/services/learning-diagnosis",
    sort_order: 1,
  },
];

function renderSection() {
  render(
    <MemoryRouter>
      <ServicesSection
        services={services}
        eyebrow="핵심 서비스"
        titleMain="진학의 순간들을"
        titleSub="막막하지 않도록. 필요한 만큼만."
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.b2b = true;
});

describe("ServicesSection 스쿨멘토", () => {
  test("작은 라벨(eyebrow)은 그리지 않고 제목은 그린다", () => {
    renderSection();
    expect(screen.queryByText("핵심 서비스")).toBeNull();
    expect(screen.getByText("진학의 순간들을")).toBeInTheDocument();
  });

  test("카드는 b2b 면을 쓴다", () => {
    renderSection();
    expect(
      screen.getByRole("link", { name: "학습진단 바로가기" }).className,
    ).toContain("shadow-card-b2b");
  });

  test("위닝은 라벨과 기존 카드 면 그대로다", () => {
    state.b2b = false;
    renderSection();
    expect(screen.getByText("핵심 서비스")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "학습진단 바로가기" }).className,
    ).not.toContain("shadow-card-b2b");
  });
});
