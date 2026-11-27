// 회원 관리 화면 테스트 공용: api 응답 라우팅과 MemoryRouter 렌더.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Mock } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import MembersAdmin from "./MembersAdmin";

type Route = unknown | (() => unknown);

// 경로별 응답을 정한다. Error 를 돌려주면 그 오류로 실패하고, 응답은 호출부가 넘긴 zod 스키마로 검증한다.
export function routeApi(mock: Mock, routes: Record<string, Route>): void {
  mock.mockImplementation((path: string) => {
    const route = routes[path];
    return {
      json: async (schema?: { parse: (value: unknown) => unknown }) => {
        if (route === undefined) throw new Error(`응답이 없는 경로: ${path}`);
        const value = typeof route === "function" ? route() : route;
        if (value instanceof Error) throw value;
        return schema ? schema.parse(value) : value;
      },
    };
  });
}

const CONFIG = {
  title: "회원",
  searchPlaceholder: "검색",
  columns: [],
};

export function renderMembers(url = "/admin/members", canEdit = true) {
  const router = createMemoryRouter(
    [{ path: "/admin/members/*", element: <MembersAdmin config={CONFIG} /> }],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <SectionEditAccessProvider value={canEdit}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
        <ConfirmAdminHost />
      </QueryClientProvider>
    </SectionEditAccessProvider>,
  );
  return { router, queryClient };
}
