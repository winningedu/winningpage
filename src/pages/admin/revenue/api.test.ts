// @vitest-environment jsdom
// 매출 행 응답을 실제 ky 클라이언트와 스키마로 검증한다. 화면 테스트는 api 를 통째로 대체해 스키마를 거치지 않는다.

import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { revenueRowsQuery } from "./api";

beforeEach(() => {
  const NodeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === "string" ? new URL(input, location.href) : input,
          init,
        );
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("order_item_id 가 bigint 라 숫자로 내려와도 매출 행을 읽는다", async () => {
  const body = {
    items: [
      {
        order_item_id: 1234,
        order_id: "6f1c1c0e-4b53-4d0e-9a53-0d0f4a6f3b21",
        paid_at: "2026-11-02T03:00:00Z",
        payer_name: "결제자",
        payer_email: "payer@example.com",
        student_name: "학생",
        service_key: "goal",
        item_name: "목표관리",
        list_amount: 1000,
        discount_amount: 0,
        paid_amount: 1000,
        refunded_amount: 0,
        revenue_status: "normal",
        net_amount: 1000,
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );

  const query = revenueRowsQuery(
    "2026-11-01T00:00:00Z",
    "2026-12-01T00:00:00Z",
  );
  const rows = await (
    query.queryFn as (c: {
      signal: AbortSignal;
    }) => Promise<{ order_item_id: number }[]>
  )({ signal: new AbortController().signal });

  expect(rows.map((r) => r.order_item_id)).toEqual([1234]);
});
