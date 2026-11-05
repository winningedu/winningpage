// 콘솔 화면 테스트 공용 도우미. 테스트 파일에서만 import 한다.
// fetch 를 경로별 응답으로 대신하고, 라우터와 쿼리 클라이언트를 감싸 렌더한다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import type { ConsoleMe } from "./api";

export const homeroomMe: ConsoleMe = {
  kind: "homeroom",
  tenant: { id: "t1", code: "SM26HB83", name: "한빛고등학교" },
  teacher: {
    id: "teacher-1",
    loginId: "SM26HB83K7MPQ2",
    name: "박지훈",
    role: "homeroom",
  },
  classIds: ["c3", "c5"],
  classes: [
    { id: "c5", grade: "고2", name: "5", group: null, isPrimary: false },
    { id: "c3", grade: "고2", name: "3", group: null, isPrimary: true },
  ],
  proxySession: null,
  mustChangePassword: false,
};

export const adminMe: ConsoleMe = {
  ...homeroomMe,
  kind: "school_admin",
  teacher: {
    id: "teacher-2",
    loginId: "SM26HB83R4TXW9",
    name: "최민정",
    role: "school_admin",
  },
  classIds: [],
  classes: [],
};

export const proxyMe: ConsoleMe = {
  ...homeroomMe,
  kind: "hq_proxy",
  teacher: null,
  classIds: [],
  classes: [],
  proxySession: {
    id: "ps1",
    tenantName: "한빛고등학교",
    expiresAt: "2099-01-01T00:00:00Z",
  },
};

export type ApiStub = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};
export type ApiHandler = ApiStub | ((init: RequestInit) => ApiStub);

/** "METHOD /path" 별 응답. 등록하지 않은 요청은 404. 호출 기록을 돌려준다. */
export function stubApi(routes: Record<string, ApiHandler>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const key = `${method} ${String(input)}`;
      const handler = routes[key];
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      if (!handler) return new Response("{}", { status: 404 });
      const stub =
        typeof handler === "function" ? handler(init ?? {}) : handler;
      return new Response(JSON.stringify(stub.body ?? {}), {
        status: stub.status ?? 200,
        ...(stub.headers ? { headers: stub.headers } : {}),
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

export function renderRoutes(
  routes: Parameters<typeof createMemoryRouter>[0],
  initialPath: string,
) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...view };
}
