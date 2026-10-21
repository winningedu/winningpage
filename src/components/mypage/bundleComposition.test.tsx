import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBundleCompositionMap } from "./bundleComposition";

const rows = [
  ["suhaeng", 1, 2],
  ["selfeval", 1, 2],
  ["target", 1, null],
  ["inquiry", 1, 2],
  ["growth", null, 1],
  ["diagnose", null, 1],
].map(([program_key, duration_months, session_quota]) => ({
  product_id: "p1",
  program_key,
  duration_months,
  session_quota,
  list_price: 1000,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          overrideTypes: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  },
}));

describe("useBundleCompositionMap", () => {
  it("6개 구성을 라벨 한글화하고 학습진단부터 자기평가 순으로 보여준다", async () => {
    const { result } = renderHook(() => useBundleCompositionMap(["p1"]));
    await waitFor(() => expect(result.current.get("p1")).toBeDefined());
    expect(result.current.get("p1")).toEqual([
      "학습진단서비스 1회",
      "목표관리서비스 1개월",
      "성장설계서비스 1회",
      "수행평가서비스 2회권",
      "심화탐구서비스 2회권",
      "자기평가서비스 2회권",
    ]);
  });
});
