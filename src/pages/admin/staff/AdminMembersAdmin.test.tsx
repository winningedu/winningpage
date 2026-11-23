// AdminMembersAdmin 조회 오류 안내. DB 원문 대신 매핑된 안내만 토스트로 보인다.

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  // 어떤 체인이든 끝에서 await 하면 조회 오류가 나오는 가짜 쿼리 빌더.
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  const failure = {
    data: null,
    error: { message: "permission denied for 홍길동", code: "42501" },
  };
  return {
    supabase: { from: () => ({ select: () => query(failure) }) },
  };
});

import { Toaster } from "@/components/ui/toast";
import AdminMembersAdmin from "./AdminMembersAdmin";

const CONFIG = { title: "관리자 계정", searchPlaceholder: "검색" };

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
      <AdminMembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("관리자 계정 조회 실패");
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("코드: 42501");
  });
  expect(document.body.textContent).not.toContain("홍길동");
  expect(alertSpy).not.toHaveBeenCalled();
});
