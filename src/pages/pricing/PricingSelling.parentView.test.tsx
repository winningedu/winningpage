import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ServiceGroup } from "@/lib/products";
import PricingSelling from "./PricingSelling";
import { BODY, TITLE } from "./parentPricingCopy";

// 학부모 열람 허용(결제 버튼만 차단) — 팀 리드 결정, 2026-09-28.
// ParentPricingBlockedModal 이 쓰던 문구를 그대로 재사용한다(parentPricingCopy.ts).

const SERVICES: ServiceGroup[] = [
  {
    key: "goal",
    name: "위닝 목표관리",
    desc: "",
    order: 0,
    products: [
      {
        id: "product-1",
        name: "12개월 이용권",
        listPrice: 100000,
        price: 80000,
        badge: null,
        recommended: false,
        tenantId: null,
        saleEndsAt: null,
      },
    ],
  },
];

vi.mock("@/lib/products", () => ({
  useProducts: () => ({
    services: SERVICES,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMatchedTenantIds: () => ({ ids: [] }),
  filterOrgProducts: (services: ServiceGroup[]) => services,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPricing(viewer: "guest" | "parent" = "guest") {
  return render(
    <MemoryRouter>
      <PricingSelling viewer={viewer} />
    </MemoryRouter>,
  );
}

function firstRadio() {
  const radio = screen.getAllByRole("radio")[0];
  if (!radio) throw new Error("radio를 찾지 못했습니다");
  return radio;
}

describe("PricingSelling parent viewer", () => {
  it("parent 뷰는 안내 배너 제목·본문을 보여준다", () => {
    renderPricing("parent");

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it("parent 뷰는 상품을 선택해도 결제하기 버튼이 없고 안내 문구만 보이며 /checkout으로 이동하지 않는다", () => {
    renderPricing("parent");

    fireEvent.click(firstRadio());

    expect(
      screen.queryByRole("button", { name: /결제하기/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(BODY).length).toBeGreaterThan(0);
    expect(mockNavigate).not.toHaveBeenCalledWith("/checkout");
  });

  it("guest(기본)는 배너가 없고 상품 선택 시 결제하기 버튼이 존재한다", () => {
    renderPricing();

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();

    fireEvent.click(firstRadio());

    expect(
      screen.getAllByRole("button", { name: /결제하기/ }).length,
    ).toBeGreaterThan(0);
  });
});
