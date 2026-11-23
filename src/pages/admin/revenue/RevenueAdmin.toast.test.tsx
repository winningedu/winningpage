// 매출 및 결제의 내보내기 안내. 내보낼 행이 없으면 게이트를 열지 않고 토스트로 알린다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

function chain(result: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => chain({ data: [], error: null, count: 0 }),
    rpc: () => chain({ data: [], error: null }),
  },
}));

import { Toaster, toast } from "@/components/ui/toast";
import RevenueAdmin from "./RevenueAdmin";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("내보낼 매출 행이 없으면 게이트를 열지 않고 경고 토스트를 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(
    <>
      <RevenueAdmin />
      <Toaster />
    </>,
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
