import { describe, expect, test, vi } from "vitest";

vi.mock("./supabase", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn() } },
}));

import { ApiError } from "./http/client";
import { queryClient } from "./queryClient";

function shouldRetry(failureCount: number, error: unknown): boolean {
  const retry = queryClient.getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("retry 는 함수여야 한다");
  return retry(failureCount, error as Error) as boolean;
}

function apiError(status: number | null) {
  return new ApiError({ status, code: "X", detail: "d" });
}

describe("queryClient 기본 옵션", () => {
  test("mutation 은 재시도하지 않는다", () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });

  test("ApiError 가 아닌 에러는 한 번만 재시도한다", () => {
    expect(shouldRetry(0, new Error("x"))).toBe(true);
    expect(shouldRetry(1, new Error("x"))).toBe(false);
  });

  test.each([401, 403, 404, 499])("ApiError %i 는 재시도하지 않는다", (s) => {
    expect(shouldRetry(0, apiError(s))).toBe(false);
  });

  test("ApiError 500 이상과 status null 은 한 번만 재시도한다", () => {
    expect(shouldRetry(0, apiError(502))).toBe(true);
    expect(shouldRetry(1, apiError(502))).toBe(false);
    expect(shouldRetry(0, apiError(null))).toBe(true);
    expect(shouldRetry(1, apiError(null))).toBe(false);
  });
});
