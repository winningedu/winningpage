// 보기 권한(view) 관리자에게는 쓰기 동작(등록, 수정, 삭제, 저장)을 그리지 않는다.
// 서버(R2)가 view 의 쓰기를 403 으로 막으므로 버튼을 눌러 봐야 실패만 본다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: {} as Record<string, "view" | "edit">,
  isSuper: false,
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "u1" }),
}));

vi.mock("@/lib/http/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/http/client")>()),
  api: {
    get: () => ({
      json: async (schema: { parse: (v: unknown) => unknown }) =>
        schema.parse({
          permissions: state.permissions,
          isSuper: state.isSuper,
        }),
    }),
  },
}));

vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  fetchSectionList: vi.fn(async () => ({
    items: state.rows,
    total: state.rows.length,
  })),
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { AdminLayout, AdminSectionRoute } from "./Admin";

function renderInLayout(section: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { path: section, element: <AdminSectionRoute section={section} /> },
        ],
      },
    ],
    { initialEntries: [`/admin/${section}`] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const notice = {
  id: 1,
  title: "공지 하나",
  created_at: "2026-11-01T00:00:00Z",
  is_active: true,
};

beforeEach(() => {
  state.permissions = {};
  state.isSuper = false;
  state.rows = [];
});

describe("엔진 섹션의 쓰기 동작", () => {
  it("view 권한이면 등록, 삭제 버튼이 없고 행 버튼은 상세 보기다", async () => {
    state.permissions = { notices: "view" };
    state.rows = [notice];
    renderInLayout("notices");

    expect(
      await screen.findByRole("button", { name: "상세 보기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /등록/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
    expect(screen.queryByRole("button", { name: "수정" })).toBeNull();
  });

  it("edit 권한이면 등록, 수정, 삭제 버튼이 보인다", async () => {
    state.permissions = { notices: "edit" };
    state.rows = [notice];
    renderInLayout("notices");

    expect(
      await screen.findByRole("button", { name: "수정" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /등록/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("view 권한이면 지식 DB 의 일괄 등록 패널과 검토 완료 버튼이 없다", async () => {
    state.permissions = { winningSuhaengTopicDb: "view" };
    state.rows = [{ id: 1, title: "주제", knowledge_type: "topic_pattern" }];
    renderInLayout("winningSuhaengTopicDb");

    await screen.findByRole("button", { name: "상세 보기" });
    expect(screen.queryByText("엑셀 일괄 등록")).toBeNull();
    expect(screen.queryByRole("button", { name: "검토 완료" })).toBeNull();
  });

  it("edit 권한이면 지식 DB 의 일괄 등록 패널과 검토 완료 버튼이 보인다", async () => {
    state.permissions = { winningSuhaengTopicDb: "edit" };
    state.rows = [{ id: 1, title: "주제", knowledge_type: "topic_pattern" }];
    renderInLayout("winningSuhaengTopicDb");

    await screen.findByRole("button", { name: "수정" });
    expect(screen.getByText("엑셀 일괄 등록")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "검토 완료" }),
    ).toBeInTheDocument();
  });

  it("view 권한이면 환불 신청의 환불완료 버튼이 없다", async () => {
    state.permissions = { refundRequests: "view" };
    state.rows = [{ id: 1, order_id: "o1", amount: 1000 }];
    renderInLayout("refundRequests");

    await screen.findByRole("button", { name: "상세 보기" });
    expect(screen.queryByRole("button", { name: /환불완료/ })).toBeNull();
  });

  it("edit 권한이면 환불 신청의 환불완료 버튼이 보인다", async () => {
    state.permissions = { refundRequests: "edit" };
    state.rows = [{ id: 1, order_id: "o1", amount: 1000 }];
    renderInLayout("refundRequests");

    await screen.findByRole("button", { name: "수정" });
    expect(
      screen.getByRole("button", { name: /환불완료/ }),
    ).toBeInTheDocument();
  });

  it("권한 맵에 없는 메뉴는 쓰기 동작을 닫는다(fail-closed)", async () => {
    state.isSuper = false;
    state.permissions = {};
    state.rows = [notice];
    renderInLayout("notices");

    expect(
      await screen.findByRole("button", { name: "상세 보기" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /등록/ })).toBeNull();
  });
});
