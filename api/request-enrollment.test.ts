// api/request-enrollment.ts 의 수량 계약 검증.
//
// defineHandler 가 만든 핸들러를 가짜 req/res 로 직접 호출하고, supabase 관리자
// 클라이언트는 createSupabaseAdmin 모듈 모킹으로 바꿔 끼운다. 상품 행과 rpc 결과만
// 케이스마다 바꾼다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

type ProductFixture = {
  id: string;
  slug: string;
  service_key: string;
  name: string;
  list_price: number | null;
  price: number | null;
  is_active: boolean;
  is_orderable: boolean;
  addon_only: boolean;
  program_key: string | null;
};

const state = vi.hoisted(() => ({
  products: [] as unknown[],
  rpcResult: { data: null, error: null } as {
    data: unknown;
    error: { code: string } | null;
  },
  rpc: vi.fn(),
}));

vi.mock("./_lib/supabaseAdmin.js", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "limit"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => {
      if (name === "parent_child_links") {
        return { data: { parent_id: "parent-1" }, error: null };
      }
      return { data: { member_type: "student", name: "학부모" }, error: null };
    };
    // supabase 쿼리 빌더는 await 가능한 thenable 이라 같은 모양으로 흉내 낸다.
    // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: state.products, error: null });
    return chain;
  };
  return {
    isSupabaseConfigError: () => false,
    createSupabaseAdmin: () => ({
      auth: {
        getUser: async () => ({
          data: { user: { id: "student-1", email: "s@example.com" } },
          error: null,
        }),
      },
      from: table,
      rpc: (...args: unknown[]) => {
        state.rpc(...args);
        return Promise.resolve(state.rpcResult);
      },
    }),
  };
});

import handler from "./request-enrollment.js";

function product(overrides: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: "p1",
    slug: "suhaeng-monthly",
    service_key: "suhaeng",
    name: "위닝 수행평가",
    list_price: 10000,
    price: 9000,
    is_active: true,
    is_orderable: true,
    addon_only: false,
    program_key: "suhaeng",
    ...overrides,
  };
}

function addon(overrides: Partial<ProductFixture> = {}) {
  return product({
    id: "a1",
    slug: "suhaeng-extra",
    name: "[추가 1회] 위닝 수행평가",
    list_price: 2000,
    price: 2000,
    addon_only: true,
    ...overrides,
  });
}

async function call(items: unknown[]) {
  const req = {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { items },
  } as unknown as VercelRequest;
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(req, res);
  return out;
}

function rpcArgs() {
  return state.rpc.mock.calls[0]?.[1] as {
    p_items: { quantity: number }[];
    p_subtotal: number;
    p_list_amount: number;
  };
}

beforeEach(() => {
  state.products = [];
  state.rpcResult = {
    data: [{ order_id: "order_x", amount: 9000, discount_amount: 0 }],
    error: null,
  };
  state.rpc.mockClear();
});

describe("request-enrollment 수량", () => {
  test("quantity 를 생략하면 1 로 보내고 금액은 단가 합이다", async () => {
    state.products = [product()];
    const out = await call([{ id: "p1" }]);
    expect(out.status).toBe(200);
    expect(rpcArgs().p_items[0]?.quantity).toBe(1);
    expect(rpcArgs().p_subtotal).toBe(9000);
    expect(rpcArgs().p_list_amount).toBe(10000);
  });

  test("추가 이용권 quantity 2 는 금액을 두 배로 재계산해 보낸다", async () => {
    state.products = [addon()];
    state.rpcResult = {
      data: [{ order_id: "order_x", amount: 4000, discount_amount: 0 }],
      error: null,
    };
    const out = await call([{ id: "a1", quantity: 2 }]);
    expect(out.status).toBe(200);
    expect(rpcArgs().p_items[0]?.quantity).toBe(2);
    expect(rpcArgs().p_subtotal).toBe(4000);
    expect((out.body as { amount: number }).amount).toBe(4000);
  });

  test("일반 상품 quantity 2 는 400 이고 rpc 를 부르지 않는다", async () => {
    state.products = [product()];
    const out = await call([{ id: "p1", quantity: 2 }]);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "결제 수량이 올바르지 않습니다." });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test.each([11, 0])(
    "추가 이용권 quantity %i 는 400 이다",
    async (quantity) => {
      state.products = [addon()];
      const out = await call([{ id: "a1", quantity }]);
      expect(out.status).toBe(400);
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );

  test.each(["2", 1.5, Number.NaN])(
    "정수가 아닌 quantity %s 는 400 이다",
    async (quantity) => {
      state.products = [addon()];
      const out = await call([{ id: "a1", quantity }]);
      expect(out.status).toBe(400);
      expect(out.body).toEqual({ error: "결제 수량이 올바르지 않습니다." });
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );

  test("같은 상품 id 가 두 번 오면 400 이다", async () => {
    state.products = [addon()];
    const out = await call([
      { id: "a1", quantity: 1 },
      { id: "a1", quantity: 2 },
    ]);
    expect(out.status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  test("rpc 가 WC067 이면 409 addon_requires_live_grant 이다", async () => {
    state.products = [addon()];
    state.rpcResult = { data: null, error: { code: "WC067" } };
    const out = await call([{ id: "a1", quantity: 1 }]);
    expect(out.status).toBe(409);
    expect(out.body).toEqual({ error: "addon_requires_live_grant" });
  });

  test("rpc 가 WC068 이면 400 이다", async () => {
    state.products = [addon()];
    state.rpcResult = { data: null, error: { code: "WC068" } };
    const out = await call([{ id: "a1", quantity: 1 }]);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "결제 수량이 올바르지 않습니다." });
  });
});
