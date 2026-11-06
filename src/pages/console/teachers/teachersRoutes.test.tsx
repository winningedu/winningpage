// 교사 관리 세 화면이 메뉴 주소(menu.ts)로 열리는지 검증한다. 라우트 트리 전체를 쓴다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import teacherConsoleRoutes from "@/routes/teacherConsoleRoutes";
import { adminMe, stubApi } from "../testUtils";

function renderAt(path: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider
        router={createMemoryRouter(teacherConsoleRoutes, {
          initialEntries: [path],
        })}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
  stubApi({
    "GET /api/console/me": { body: adminMe },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: { classes: [] } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("교사 관리 라우트", () => {
  it.each([
    ["/teacher/teachers", "교사 정보 입력관리"],
    ["/teacher/teachers/excel", "교사 엑셀 일괄업로드"],
    ["/teacher/accounts", "교사 계정 관리"],
  ])("%s 는 %s 화면을 연다", async (path, title) => {
    renderAt(path);

    expect(
      await screen.findByRole("heading", { level: 1, name: title }),
    ).toBeTruthy();
  });
});
