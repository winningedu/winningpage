// 매출 및 결제의 내보내기 안내. 내보낼 행이 없으면 게이트를 열지 않고 토스트로 알린다.

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get },
}));

import { Toaster, toast } from "@/components/ui/toast";
import RevenueAdmin from "./RevenueAdmin";

beforeEach(() => {
  get.mockImplementation((path: string) => ({
    json: async () => {
      if (path === "admin/revenue" || path === "admin/revenue/services")
        return { items: [] };
      return { approvalWaiting: 0, processWaiting: 0 };
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  get.mockReset();
});

test("내보낼 매출 행이 없으면 게이트를 열지 않고 경고 토스트를 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <RevenueAdmin />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "엑셀 다운로드" }));

  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("내보낼 데이터가 없습니다."),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(alertSpy).not.toHaveBeenCalled();
});
