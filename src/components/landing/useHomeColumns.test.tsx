import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: { data: [] as unknown[] | null, error: null as unknown },
}));

vi.mock("@/lib/supabase", () => {
  const chain = () =>
    Object.assign(Promise.resolve(state.result), {
      select: chain,
      eq: chain,
      order: chain,
    });
  return { supabase: { from: () => chain() } };
});

const { useHomeColumns } = await import("./useHomeColumns");

beforeEach(() => {
  state.result = { data: [], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useHomeColumns", () => {
  test("처음에는 loading이고 조회가 끝나면 교육청소식을 뺀 박스를 돌려준다", async () => {
    state.result = {
      data: [
        { id: "a", title: "A", created_at: "2026-10-01T00:00:00Z" },
        {
          id: "b",
          title: "B",
          category: "교육청소식",
          created_at: "2026-10-02T00:00:00Z",
        },
      ],
      error: null,
    };
    const { result } = renderHook(() => useHomeColumns());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.boxes.map((b) => b.id)).toEqual(["a"]);
  });

  test("조회가 실패하면 error 상태이고 오류를 기록한다", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const { result } = renderHook(() => useHomeColumns());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.boxes).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});
