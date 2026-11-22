// 회원 관리 조회 오류 안내. DB 원문 대신 매핑된 안내만 토스트로 보인다.

import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
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
    from: () =>
      chain({
        data: null,
        error: { message: "permission denied for 홍길동", code: "42501" },
      }),
    rpc: vi.fn(),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: () => <div />,
}));

import { Toaster } from "@/components/ui/toast";
import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("조회에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(
    <>
      <MembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("회원 조회 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("코드: 42501");
  });
  expect(document.body.textContent).not.toContain("홍길동");
  expect(alertSpy).not.toHaveBeenCalled();
});
