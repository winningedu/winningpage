// 쿠폰 관리의 안내. 알림창 대신 토스트로 보이고, 실패 안내는 닫을 때까지 남는다.

import "@testing-library/jest-dom/vitest";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { FakeApiError, on, resetApi } from "./fakeApi";
import { renderCoupons } from "./testKit";

beforeEach(() => {
  resetApi();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("목록 조회에 실패하면 원문 없이 닫을 때까지 남는 오류 토스트가 보인다", async () => {
  on("GET", "admin/coupons", () => {
    throw new FakeApiError(500, "INTERNAL_ERROR");
  });
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const addSpy = vi.spyOn(toast, "add");
  renderCoupons();

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
  expect(document.body.textContent).not.toContain("INTERNAL_ERROR");
  expect(alertSpy).not.toHaveBeenCalled();
});
