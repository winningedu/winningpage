import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useHomeSectionCopy } from "./useHomeSectionCopy";

const result = vi.hoisted(() => ({
  value: { data: [] as unknown[], error: null as unknown },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve(result.value) }),
  },
}));

describe("useHomeSectionCopy", () => {
  test("3행을 섹션 키별 제목 props로 매핑한다", async () => {
    result.value = {
      error: null,
      data: [
        {
          section_key: "acceptance",
          eyebrow: null,
          title_main: "큰A",
          title_sub: "중A",
        },
        {
          section_key: "services",
          eyebrow: "라벨",
          title_main: "큰S",
          title_sub: "중S",
        },
        {
          section_key: "mentor",
          eyebrow: "멘토라벨",
          title_main: "큰M",
          title_sub: null,
        },
      ],
    };
    const { result: hook } = renderHook(() => useHomeSectionCopy());
    await waitFor(() => expect(hook.current.acceptance).not.toBeNull());
    expect(hook.current.acceptance).toEqual({ titleMain: "큰A", titleSub: "중A" });
    expect(hook.current.services).toEqual({
      eyebrow: "라벨",
      titleMain: "큰S",
      titleSub: "중S",
    });
    expect(hook.current.mentor).toEqual({
      eyebrow: "멘토라벨",
      titleMain: "큰M",
    });
  });

  test("행이 없거나 조회 실패면 null이다", async () => {
    result.value = { data: [], error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result: hook } = renderHook(() => useHomeSectionCopy());
    await new Promise((r) => setTimeout(r, 0));
    expect(hook.current).toEqual({
      acceptance: null,
      services: null,
      mentor: null,
    });
  });
});
