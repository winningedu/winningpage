// useProducts 숨길 프로그램 게이트 - 가격표(/pricing), 신청, 결제 카탈로그가 모두 이 훅을
// 쓰므로, site.features.hiddenPrograms에 든 서비스 그룹은 여기서 한 번에 빠진다.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { rows, siteState } = vi.hoisted(() => ({
  rows: { current: [] as Record<string, unknown>[] },
  siteState: { hidden: [] as string[] },
}));

vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      premium: true,
      get hiddenPrograms() {
        return siteState.hidden;
      },
    },
  },
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: () => {
      type Builder = Promise<unknown> & {
        select: () => Builder;
        eq: () => Builder;
        order: () => Builder;
      };
      const builder: Builder = Object.assign(
        Promise.resolve({ data: rows.current, error: null }),
        {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
        },
      );
      return builder;
    },
  },
}));

import { useProducts } from "./products";

function row(id: string, serviceKey: string) {
  return {
    id,
    service_key: serviceKey,
    service_name: serviceKey,
    name: `상품 ${id}`,
    is_orderable: true,
  };
}

async function loadKeys() {
  rows.current = [row("a", "goal"), row("b", "growth"), row("c", "selfeval")];
  const { result } = renderHook(() => useProducts());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current.services.map((s) => s.key);
}

describe("useProducts - 숨길 프로그램", () => {
  it("빈 배열이면 모든 서비스 그룹을 돌려준다", async () => {
    siteState.hidden = [];

    expect(await loadKeys()).toEqual(["goal", "growth", "selfeval"]);
  });

  it("growth를 숨기면 growth 그룹만 빠진다", async () => {
    siteState.hidden = ["growth"];

    expect(await loadKeys()).toEqual(["goal", "selfeval"]);
  });
});
