import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  b2b: true,
  result: { data: [] as unknown[] | null, error: null as unknown },
  selected: "",
}));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get b2bMenu() {
        return state.b2b;
      },
    },
  },
}));

vi.mock("@/lib/supabase", () => {
  const chain = () =>
    Object.assign(Promise.resolve(state.result), {
      select: (columns: string) => {
        state.selected = columns;
        return chain();
      },
      eq: chain,
      order: chain,
    });
  return { supabase: { from: () => chain() } };
});

const { useHomeMentors } = await import("./useHomeMentors");

const row = (id: string, consent: boolean) => ({
  id,
  badge: "위닝 8기",
  title_lines: ["김형준 멘토"],
  consent_confirmed: consent,
});

beforeEach(() => {
  state.b2b = true;
  state.result = { data: [row("a", true), row("b", false)], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useHomeMentors 동의 확인", () => {
  test("스쿨멘토는 동의를 확인한 카드만 돌려준다", async () => {
    const { result } = renderHook(() => useHomeMentors());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.mentors.map((m) => m.id)).toEqual(["a"]);
    expect(state.selected).toContain("consent_confirmed");
  });

  test("위닝은 동의 칸을 읽지 않고 모든 활성 카드를 돌려준다", async () => {
    state.b2b = false;
    const { result } = renderHook(() => useHomeMentors());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.mentors.map((m) => m.id)).toEqual(["a", "b"]);
    expect(state.selected).not.toContain("consent_confirmed");
  });

  test("조회가 실패하면 error 상태이고 오류를 기록한다", async () => {
    state.result = { data: null, error: { message: "boom" } };
    const { result } = renderHook(() => useHomeMentors());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.mentors).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});
