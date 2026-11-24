// 관리자 계정, 권한 묶음 화면 테스트 공용: api 응답 라우팅과 MemoryRouter 렌더.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Mock } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import AdminMembersAdmin from "./AdminMembersAdmin";
import AdminRolesAdmin from "./AdminRolesAdmin";

export interface HttpMock {
  get: Mock;
  post: Mock;
  patch: Mock;
  put: Mock;
  delete: Mock;
}

type Route = unknown | (() => unknown);

// 경로별 응답을 정한다. Error 를 돌려주면 그 오류로 실패하고, 응답은 호출부가 넘긴 zod 스키마로 검증한다.
export function routeApi(mock: Mock, routes: Record<string, Route>): void {
  mock.mockImplementation((path: string) => {
    const route = routes[path];
    const resolve = (schema?: { parse: (value: unknown) => unknown }) => {
      if (route === undefined) throw new Error(`응답이 없는 경로: ${path}`);
      const value = typeof route === "function" ? route() : route;
      if (value instanceof Error) throw value;
      return schema ? schema.parse(value) : value;
    };
    // 응답은 호출부가 넘긴 zod 스키마로 검증한다. 204 응답을 받는 DELETE 는 테스트가 따로 정한다.
    return {
      json: async (schema?: { parse: (value: unknown) => unknown }) =>
        resolve(schema),
    };
  });
}

export const MEMBERS_CONFIG = {
  title: "관리자 계정",
  searchPlaceholder: "검색",
};
export const ROLES_CONFIG = { title: "권한 관리", searchPlaceholder: "검색" };

function renderAt(path: string, element: React.ReactElement, url: string) {
  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [url],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <ConfirmAdminHost />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

export function renderMembers(url = "/admin/adminMembers") {
  return renderAt(
    "/admin/adminMembers/*",
    <AdminMembersAdmin config={MEMBERS_CONFIG} />,
    url,
  );
}

export function renderRoles(url = "/admin/adminRoles") {
  return renderAt(
    "/admin/adminRoles/*",
    <AdminRolesAdmin config={ROLES_CONFIG} />,
    url,
  );
}
