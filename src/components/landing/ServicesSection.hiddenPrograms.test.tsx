// 핵심 서비스 카드의 신규 서비스 노출 게이트 - site.features.hiddenPrograms에 든
// 프로그램으로 가는 카드는 렌더하지 않고, 빈 배열이면 전부 렌더한다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import type { Service } from "./services/ServiceCard";

const siteState = vi.hoisted(() => ({ hidden: [] as string[] }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      premium: true,
      get hiddenPrograms() {
        return siteState.hidden;
      },
    },
  },
}));

const { default: ServicesSection } = await import("./ServicesSection");

const services: Service[] = [
  { id: "a", name: "목표관리", link: "/services/goal", sort_order: 1 },
  { id: "b", name: "성장설계", link: "/services/growth", sort_order: 2 },
  {
    id: "c",
    name: "자기평가",
    link: "/services/self-assessment",
    sort_order: 3,
  },
];

function renderSection() {
  return render(
    <MemoryRouter>
      <ServicesSection services={services} />
    </MemoryRouter>,
  );
}

describe("ServicesSection - 숨길 프로그램", () => {
  test("빈 배열이면 모든 카드를 렌더한다", () => {
    siteState.hidden = [];
    renderSection();

    expect(screen.getAllByRole("link", { name: /바로가기/ })).toHaveLength(3);
  });

  test("growth를 숨기면 성장설계 카드만 빠진다", () => {
    siteState.hidden = ["growth"];
    renderSection();

    expect(screen.queryByText("성장설계")).not.toBeInTheDocument();
    expect(screen.getByText("목표관리")).toBeInTheDocument();
    expect(screen.getByText("자기평가")).toBeInTheDocument();
  });
});
