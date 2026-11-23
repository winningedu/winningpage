// 회원 관리의 내보내기 안내. 내보낼 행이 없으면 게이트를 열지 않고 토스트로 알린다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

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
    from: () => chain({ data: [], error: null }),
    rpc: vi.fn(),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: () => <div />,
}));

import { Toaster, toast } from "@/components/ui/toast";
import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("내보낼 회원이 없으면 게이트를 열지 않고 닫을 때까지 남는 경고 토스트를 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const addSpy = vi.spyOn(toast, "add");
  render(
    <>
      <MembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "엑셀 다운로드" }));

  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("내보낼 데이터가 없습니다."),
  );
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ priority: "high", timeout: 0 }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(alertSpy).not.toHaveBeenCalled();
});
