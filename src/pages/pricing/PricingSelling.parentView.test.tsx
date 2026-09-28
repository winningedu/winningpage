import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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

function renderPricing(viewer?: "guest" | "parent") {
  return render(
    <MemoryRouter>
      <PricingSelling viewer={viewer} />
    </MemoryRouter>,
  );
}

describe("PricingSelling parent viewer", () => {
  it("parent 뷰는 안내 배너 제목·본문을 보여준다", () => {
    renderPricing("parent");

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });
});
