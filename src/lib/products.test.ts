import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { rows } = vi.hoisted(() => ({
  rows: { current: [] as Record<string, unknown>[] },
}));

// supabase 쿼리 빌더, 체이닝 메서드는 자기 자신을 돌려주고 await 시 rows 를 준다.
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

function row(id: string, isOrderable: boolean | null | undefined) {
  return {
    id,
    service_key: "mentor",
    service_name: "위닝 콜멘토",
    name: `상품 ${id}`,
    ...(isOrderable === undefined ? {} : { is_orderable: isOrderable }),
  };
}

describe("useProducts isOrderable 매핑", () => {
  it("is_orderable 값을 상품의 isOrderable 로 싣는다", async () => {
    rows.current = [row("a", true), row("b", false)];
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const products = result.current.services[0]?.products ?? [];
    expect(products.map((p) => p.isOrderable)).toEqual([true, false]);
  });

  it("값이 없거나 null 이면 주문 불가로 본다", async () => {
    rows.current = [row("a", null), row("b", undefined)];
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const products = result.current.services[0]?.products ?? [];
    expect(products.map((p) => p.isOrderable)).toEqual([false, false]);
  });
});

describe("useProducts 추가 이용권 분리", () => {
  it("addon_only 행은 services 에서 빼고 addons 에 서비스 정보와 함께 싣는다", async () => {
    rows.current = [
      row("a", true),
      {
        id: "x",
        service_key: "suhaeng",
        service_name: "위닝 수행평가",
        name: "[추가 1회] 위닝 수행평가",
        price: 2000,
        list_price: 2000,
        is_orderable: true,
        addon_only: true,
      },
    ];
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.services.map((s) => s.key)).toEqual(["mentor"]);
    expect(result.current.addons).toHaveLength(1);
    expect(result.current.addons[0]).toMatchObject({
      id: "x",
      serviceKey: "suhaeng",
      serviceName: "위닝 수행평가",
      price: 2000,
    });
  });
});
