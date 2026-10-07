import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ServiceGroup, ServiceProduct } from "@/lib/products";
import ServiceCatalog from "./ServiceCatalog";

// 번들 구성 조회는 이 테스트의 관심사가 아니다(org 한정 상품 없음).
vi.mock("@/components/mypage/bundleComposition", () => ({
  useBundleCompositionMap: () => new Map(),
}));

const NOTICE = "위닝 콜멘토 서비스는 2026년 말부터 제공될 예정입니다.";

function product(id: string, name: string): ServiceProduct {
  return {
    id,
    name,
    listPrice: 10000,
    price: 9000,
    badge: null,
    recommended: false,
    isOrderable: true,
    tenantId: null,
    saleEndsAt: null,
  };
}

function group(key: string, name: string, products: ServiceProduct[]) {
  return { key, name, desc: "", order: 1, products } as ServiceGroup;
}

function renderCatalog(
  services: ServiceGroup[],
  serviceNotices?: Partial<Record<string, string>>,
) {
  return render(
    <MemoryRouter>
      <ServiceCatalog
        services={services}
        selected={{}}
        onToggle={() => {}}
        {...(serviceNotices ? { serviceNotices } : {})}
      />
    </MemoryRouter>,
  );
}

describe("ServiceCatalog serviceNotices", () => {
  const mentor = group("mentor", "위닝 콜멘토", [product("m1", "콜멘토 1회")]);
  const goal = group("goal", "위닝 목표관리", [product("g1", "목표 1개월")]);

  it("넘긴 서비스 블록에만 안내 문구를 표시한다", () => {
    renderCatalog([goal, mentor], { mentor: NOTICE });
    const mentorBlock = screen
      .getByText("위닝 콜멘토", { selector: "h2, h3, p, span, div" })
      .closest("section") as HTMLElement;
    const goalBlock = screen
      .getByText("위닝 목표관리", { selector: "h2, h3, p, span, div" })
      .closest("section") as HTMLElement;
    expect(within(mentorBlock).getByText(NOTICE)).toBeInTheDocument();
    expect(within(goalBlock).queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("플랜이 1개뿐인 서비스에서도 표시한다", () => {
    renderCatalog([mentor], { mentor: NOTICE });
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("넘기지 않으면 표시하지 않는다", () => {
    renderCatalog([mentor]);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
