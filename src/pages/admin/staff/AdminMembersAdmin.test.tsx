// AdminMembersAdmin 조회 오류 안내. 서버가 쓴 안내만 토스트로 보이고 원문은 새지 않는다.

import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("조회에 실패하면 제목과 서버 안내만 토스트로 보인다", async () => {
  routeApi(http.get, {
    "admin/staff": new ApiError({
      status: 403,
      code: "FORBIDDEN",
      detail: "이 메뉴를 쓸 권한이 없습니다.",
    }),
  });
  renderMembers();

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("관리자 계정 조회 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("이 메뉴를 쓸 권한이 없습니다.");
  });
});
