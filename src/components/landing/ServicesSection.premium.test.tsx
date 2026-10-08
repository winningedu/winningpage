// 핵심 서비스 카드의 프리미엄 노출 게이트 - 프리미엄을 숨기는 사이트(스쿨멘토)는
// is_premium 카드와 프리미엄 경로로 가는 카드를 렌더하지 않는다. 카드는 DB에서도
// 오므로 렌더 단계에서 거른다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import type { Service } from "./services/ServiceCard";

const siteState = vi.hoisted(() => ({ premium: true }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get premium() {
        return siteState.premium;
      },
    },
  },
}));

const { default: ServicesSection } = await import("./ServicesSection");

const services: Service[] = [
  {
    id: "svc-1",
    name: "학습진단",
    link: "/services/learning-diagnosis",
    sort_order: 1,
  },
  {
    id: "svc-2",
    name: "컨설팅 프리미엄",
    link: "/page/premium/admission-consulting/a",
    sort_order: 2,
    is_premium: true,
  },
  {
    id: "svc-3",
    name: "국제 해외 프리미엄",
    link: "/page/premium/global-university",
    sort_order: 3,
    is_premium: false,
  },
  {
    id: "svc-4",
    name: "플래그만 프리미엄",
    link: "/services/goal",
    sort_order: 4,
    is_premium: true,
  },
];

function renderSection() {
  return render(
    <MemoryRouter>
      <ServicesSection services={services} />
    </MemoryRouter>,
  );
}

describe("ServicesSection - 프리미엄 노출(winning)", () => {
  test("프리미엄 카드를 포함해 모두 렌더한다", () => {
    siteState.premium = true;
    renderSection();

    expect(screen.getAllByRole("link", { name: /바로가기/ })).toHaveLength(4);
  });
});

describe("ServicesSection - 프리미엄 숨김(schoolmentor)", () => {
  test("is_premium 카드와 프리미엄 경로 카드를 거르고 나머지만 렌더한다", () => {
    siteState.premium = false;
    renderSection();

    expect(screen.getByText("학습진단")).toBeInTheDocument();
    expect(screen.queryByText("컨설팅 프리미엄")).not.toBeInTheDocument();
    expect(screen.queryByText("국제 해외 프리미엄")).not.toBeInTheDocument();
    expect(screen.queryByText("플래그만 프리미엄")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /바로가기/ })).toHaveLength(1);
  });
});
