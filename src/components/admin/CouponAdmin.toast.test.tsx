// 쿠폰 관리의 안내. 알림창 대신 토스트로 보이고, 실패 안내는 닫을 때까지 남는다.

import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
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
    from: () =>
      chain({
        data: null,
        error: { message: "permission denied for 홍길동", code: "42501" },
      }),
  },
}));

import { Toaster, toast } from "@/components/ui/toast";
import CouponAdmin from "./CouponAdmin";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("목록 조회에 실패하면 원문 없이 닫을 때까지 남는 오류 토스트가 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const addSpy = vi.spyOn(toast, "add");
  render(
    <>
      <CouponAdmin />
      <Toaster />
    </>,
  );

  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("쿠폰관리 조회 실패"),
  );
  expect(
    document.querySelector('[data-slot="toast-description"]'),
  ).toHaveTextContent("잠시 후 다시 시도해 주세요.");
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", priority: "high", timeout: 0 }),
  );
  expect(document.body.textContent).not.toContain("홍길동");
  expect(alertSpy).not.toHaveBeenCalled();
});
