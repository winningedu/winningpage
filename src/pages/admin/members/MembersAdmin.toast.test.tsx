// 회원 관리의 내보내기 안내. 내보낼 행이 없으면 게이트를 열지 않고 토스트로 알린다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: () => <div />,
}));

import { toast } from "@/components/ui/toast";
import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, { "admin/members": { items: [] } });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
});

test("내보낼 회원이 없으면 게이트를 열지 않고 닫을 때까지 남는 경고 토스트를 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const addSpy = vi.spyOn(toast, "add");
  renderMembers();

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
