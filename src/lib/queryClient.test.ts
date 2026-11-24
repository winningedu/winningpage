import { describe, expect, test, vi } from "vitest";

vi.mock("./supabase", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn() } },
}));

import { queryClient } from "./queryClient";

describe("queryClient 기본 옵션", () => {
  test("mutation 은 재시도하지 않고 query 는 한 번 재시도한다", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(0);
    expect(defaults.queries?.retry).toBe(1);
  });
});
