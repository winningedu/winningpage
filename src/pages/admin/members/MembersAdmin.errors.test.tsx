// 회원 관리 조회 오류 안내. 서버가 쓴 안내만 토스트로 보인다.

import "@testing-library/jest-dom/vitest";
import { waitFor } from "@testing-library/react";
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

import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("조회에 실패하면 서버 안내만 토스트로 보인다", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/members": new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "서버 오류가 났어요.",
    }),
  });
  renderMembers();

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("회원 조회 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("서버 오류가 났어요.");
  });
  expect(alertSpy).not.toHaveBeenCalled();
});
