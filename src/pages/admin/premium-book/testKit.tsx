// 프리미엄 책자 화면 테스트 공용. 실제 라우터, react-query, 어드민 엔진 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  createMemoryRouter,
  type InitialEntry,
  RouterProvider,
} from "react-router";
import { Toaster } from "@/components/ui/toast";
import { mainConfigs } from "@/pages/admin/configs/main";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import PremiumBookAdmin from "./PremiumBookAdmin";

export const PAGES_PATH = "admin/premium-book/pages";

export const pageRow = (id: number, sortOrder: number) => ({
  id,
  sort_order: sortOrder,
  image_url: `https://cdn.test/storage/v1/object/public/banners/premium-book/p${String(sortOrder).padStart(2, "0")}.webp`,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
});

export function renderPremiumBook(
  initialEntry: InitialEntry = "/admin/premiumBookPages",
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  canEdit = true,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/premiumBookPages/*",
        element: (
          <PremiumBookAdmin config={mainConfigs.premiumBookPages as never} />
        ),
      },
      { path: "/admin/other", element: <div>다른 화면</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <SectionEditAccessProvider value={canEdit}>
        <RouterProvider router={router} />
      </SectionEditAccessProvider>
      <Toaster />
      <ConfirmAdminHost />
    </QueryClientProvider>,
  );
  return { router, client, ...view };
}
