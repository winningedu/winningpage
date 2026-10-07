import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ServiceGroup, ServiceProduct } from "@/lib/products";
import ServiceCatalog from "./ServiceCatalog";

// 번들 구성 조회는 이 테스트의 관심사가 아니다(org 한정 상품 없음).
vi.mock("@/components/mypage/bundleComposition", () => ({
  useBundleCompositionMap: () => new Map(),
}));

const NOTICE = "위닝 콜멘토 서비스는 2026년 말부터 제공될 예정입니다.";

function product(id: string, name: string, isOrderable = true): ServiceProduct {
  return {
    id,
    name,
    listPrice: 10000,
    price: 9000,
    badge: null,
    recommended: false,
    isOrderable,
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

describe("ServiceCatalog 주문 불가 상품", () => {
  function renderWith(
    services: ServiceGroup[],
    onToggle = vi.fn(),
    selected: Record<string, string> = {},
  ) {
    render(
      <MemoryRouter>
        <ServiceCatalog
          services={services}
          selected={selected}
          onToggle={onToggle}
        />
      </MemoryRouter>,
    );
    return onToggle;
  }

  it("카드는 보이지만 disabled 이고 클릭해도 onToggle 을 부르지 않는다", () => {
    const mentor = group("mentor", "위닝 콜멘토", [
      product("m1", "[1회] 콜멘토", false),
    ]);
    const onToggle = renderWith([mentor]);
    const radio = screen.getByRole("radio", { name: /콜멘토/ });
    expect(radio).toBeDisabled();
    fireEvent.click(radio);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("화살표 이동은 주문 불가 상품을 건너뛴다", () => {
    const goal = group("goal", "위닝 목표관리", [
      product("g1", "[1개월] 목표"),
      product("g2", "[3개월] 목표", false),
      product("g3", "[6개월] 목표"),
    ]);
    const onToggle = renderWith([goal], vi.fn(), { goal: "g1" });
    fireEvent.keyDown(screen.getByRole("radio", { name: /1개월/ }), {
      key: "ArrowDown",
    });
    expect(onToggle).toHaveBeenCalledWith("goal", "g3");
  });

  it("주문 가능 상품이 하나뿐이면 화살표로 아무것도 바꾸지 않는다", () => {
    const goal = group("goal", "위닝 목표관리", [
      product("g1", "[1개월] 목표"),
      product("g2", "[3개월] 목표", false),
    ]);
    const onToggle = renderWith([goal], vi.fn(), { goal: "g1" });
    fireEvent.keyDown(screen.getByRole("radio", { name: /1개월/ }), {
      key: "ArrowDown",
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("전부 주문 불가인 그룹은 어떤 탭 정지점도 만들지 않는다", () => {
    const mentor = group("mentor", "위닝 콜멘토", [
      product("m1", "[1회] 콜멘토", false),
    ]);
    renderWith([mentor]);
    expect(screen.getByRole("radio", { name: /콜멘토/ })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});
