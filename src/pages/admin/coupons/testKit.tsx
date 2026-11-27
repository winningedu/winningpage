// 쿠폰 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import CouponAdmin from "./CouponAdmin";

export const couponRow = {
  id: "c1",
  slug: "gift-1",
  title: "선물 쿠폰",
  discount_amount: 1000,
  min_amount: 0,
  valid_until: null,
  max_uses_per_user: 1,
  max_redemptions: null,
  stackable: false,
  grant_type: "granted",
  grant_on_signup: false,
  is_active: true,
  tenant_id: null,
  code: null,
  created_at: "2026-08-01T00:00:00Z",
};

export function listBody(over: Record<string, unknown> = {}) {
  return {
    items: [couponRow],
    redemptionStats: { byCoupon: {}, truncated: false },
    grantedCouponIds: [],
    tenants: [],
    ...over,
  };
}

export function renderCoupons(initialPath = "/admin/coupons", canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/admin/coupons/*", element: <CouponAdmin /> },
      { path: "/admin/other", element: <div>다른 화면</div> },
    ],
    { initialEntries: [initialPath] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <SectionEditAccessProvider value={canEdit}>
        <RouterProvider router={router} />
      </SectionEditAccessProvider>
      <Toaster />
    </QueryClientProvider>,
  );
  return { router, client, ...view };
}
