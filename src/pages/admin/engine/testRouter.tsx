// 엔진 섹션 화면 테스트용 데이터 라우터. useBlocker 가 데이터 라우터에서만 돌아서 MemoryRouter 로는 폼 화면을 못 그린다.

import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createMemoryRouter,
  Outlet,
  type RouteObject,
  RouterProvider,
} from "react-router";
import { AdminSectionRoute } from "@/pages/Admin";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import { TestQueryProvider } from "./testQuery";

export function renderSectionRoutes(
  section: string,
  entry: string | { pathname: string; state?: unknown },
  options: { extras?: ReactNode; extraRoutes?: RouteObject[] } = {},
) {
  // 쓰기 흐름을 보는 테스트용 도우미라 edit 권한으로 연다. view 화면은 Admin.viewOnly.test.tsx 가 본다.
  const element = (
    <SectionEditAccessProvider value={true}>
      <AdminSectionRoute section={section} />
    </SectionEditAccessProvider>
  );
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            {options.extras}
          </>
        ),
        children: [
          { path: `/admin/${section}`, element },
          { path: `/admin/${section}/new`, element },
          { path: `/admin/${section}/:id`, element },
          ...(options.extraRoutes ?? []),
        ],
      },
    ],
    {
      initialEntries: [
        typeof entry === "string"
          ? entry
          : { pathname: entry.pathname, state: entry.state },
      ],
    },
  );
  const view = render(
    <TestQueryProvider>
      <RouterProvider router={router} />
    </TestQueryProvider>,
  );
  return { router, ...view };
}
