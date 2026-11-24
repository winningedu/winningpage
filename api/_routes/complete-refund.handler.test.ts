// POST /api/complete-refund 핸들러 계약. 토스 호출은 fetch 대체로, 어드민 토큰 RPC 는 createClient 대체로 막는다.
// 권한 경계: 환불 요청 메뉴(refundRequests)의 edit.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  clients: [] as { url: string; key: string; token: string }[],
  rpc: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (
    url: string,
    key: string,
    options: { global: { headers: { Authorization: string } } },
  ) => {
    kit.clients.push({
      url,
      key,
      token: options.global.headers.Authorization,
    });
    return { rpc: kit.rpc };
  },
}));

import handler from "./complete-refund.js";

const call = (body: unknown) =>
  callHandler(
    handler as unknown as (
      req: VercelRequest,
      res: VercelResponse,
    ) => Promise<void>,
    body,
  );

function grant(level: "view" | "edit", key = "refundRequests") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: key, level }],
    error: null,
  });
}

const REFUND = {
  id: 7,
  order_id: "o1",
  amount: 5000,
  reason: "단순 변심",
  status: "requested",
  approval_status: "approved",
  refund_bank: null,
  refund_account: null,
  refund_holder: null,
};

const toss = vi.fn();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.refund_requests = () => ({ ...REFUND });
  kit.state.rows.orders = () => ({ id: "o1", payment_key: "pk1", raw: {} });
  grant("edit");
  kit.clients.length = 0;
  kit.rpc.mockReset();
  kit.rpc.mockResolvedValue({
    data: { id: 7, status: "completed" },
    error: null,
  });
  toss.mockReset();
  toss.mockImplementation(async () => json(200, { cancels: [] }));
  vi.stubGlobal("fetch", toss);
  vi.stubEnv("TOSS_SECRET_KEY", "toss-secret");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "pub-key");
  vi.stubEnv("WINNING_SUPABASE_URL", "https://w.supabase.co");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("권한과 입력", () => {
  test("refundRequests 가 보기 권한뿐이면 403 이고 환불 요청을 읽지 않는다", async () => {
    grant("view");

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain(
      "refund_requests",
    );
    expect(toss).not.toHaveBeenCalled();
  });

  test("refundRequestId 가 없으면 400 VALIDATION_FAILED 이고 메시지를 담는다", async () => {
    const r = await call({});

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(JSON.stringify(r.body)).toContain("refundRequestId 가 필요합니다.");
  });

  test("문자열 id 와 숫자 id 를 모두 받는다", async () => {
    const r = await call({ refundRequestId: "7" });

    expect(r.status).toBe(200);
  });
});

describe("사전 검사", () => {
  test("없는 환불 신청은 404 REFUND_NOT_FOUND", async () => {
    kit.state.rows.refund_requests = () => null;

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "REFUND_NOT_FOUND",
      detail: "환불 신청을 찾을 수 없습니다.",
    });
  });

  test("이미 완료된 건은 토스를 부르지 않고 alreadyCompleted 를 돌려준다", async () => {
    kit.state.rows.refund_requests = () => ({ ...REFUND, status: "completed" });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ alreadyCompleted: true });
    expect(toss).not.toHaveBeenCalled();
  });

  test("승인되지 않은 신청은 409 WC035 이고 토스를 부르지 않는다", async () => {
    kit.state.rows.refund_requests = () => ({
      ...REFUND,
      approval_status: "pending",
    });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "WC035",
      detail: "아직 승인되지 않은 환불 신청입니다.",
    });
    expect(toss).not.toHaveBeenCalled();
  });

  test("처리할 수 없는 상태는 409 WC036", async () => {
    kit.state.rows.refund_requests = () => ({ ...REFUND, status: "rejected" });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "WC036",
      detail: "지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
    });
  });

  test("주문이 없으면 404 ORDER_NOT_FOUND", async () => {
    kit.state.rows.orders = () => null;

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  test("결제 승인 키가 없으면 409 PAYMENT_KEY_MISSING", async () => {
    kit.state.rows.orders = () => ({ id: "o1", payment_key: " ", raw: {} });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "PAYMENT_KEY_MISSING" });
  });

  test("토스 시크릿이 없으면 500 TOSS_SECRET_MISSING", async () => {
    vi.stubEnv("TOSS_SECRET_KEY", "");

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "TOSS_SECRET_MISSING",
      detail: "서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다.",
    });
  });
});

describe("토스 호출", () => {
  test("결제 조회 실패는 502 TOSS_QUERY_FAILED 이고 토스 코드를 tossCode 로 싣는다", async () => {
    toss.mockResolvedValueOnce(
      json(404, {
        code: "NOT_FOUND_PAYMENT",
        message: "결제를 찾을 수 없어요",
      }),
    );

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({
      code: "TOSS_QUERY_FAILED",
      detail: "결제를 찾을 수 없어요",
      tossCode: "NOT_FOUND_PAYMENT",
    });
    expect(kit.rpc).not.toHaveBeenCalled();
  });

  test("가상계좌인데 환불계좌가 없으면 취소 전에 422 REFUND_ACCOUNT_REQUIRED", async () => {
    kit.state.rows.orders = () => ({
      id: "o1",
      payment_key: "pk1",
      raw: { virtualAccount: { accountNumber: "1" } },
    });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: "REFUND_ACCOUNT_REQUIRED" });
    expect(toss).toHaveBeenCalledTimes(1);
  });

  test("취소 실패는 토스 상태 코드를 유지하고 TOSS_CANCEL_FAILED 와 tossCode 를 싣는다", async () => {
    toss
      .mockResolvedValueOnce(json(200, { cancels: [] }))
      .mockResolvedValueOnce(
        json(400, { code: "ALREADY_CANCELED_PAYMENT", message: "이미 취소됨" }),
      );

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "TOSS_CANCEL_FAILED",
      detail: "이미 취소됨",
      tossCode: "ALREADY_CANCELED_PAYMENT",
    });
    expect(kit.rpc).not.toHaveBeenCalled();
  });

  test("취소 요청에는 환불 건 고정 Idempotency-Key 와 태그 사유가 실린다", async () => {
    toss
      .mockResolvedValueOnce(json(200, { cancels: [] }))
      .mockResolvedValueOnce(
        json(200, {
          cancels: [{ cancelAmount: 5000, cancelReason: "[rr:7] 단순 변심" }],
        }),
      );

    await call({ refundRequestId: 7 });

    const [url, init] = toss.mock.calls[1] ?? [];
    expect(String(url)).toContain("/pk1/cancel");
    expect(init.headers["Idempotency-Key"]).toBe("refund-request-7");
    expect(JSON.parse(init.body)).toMatchObject({
      cancelAmount: 5000,
      cancelReason: "[rr:7] 단순 변심",
    });
  });
});

describe("완료 처리", () => {
  test("취소가 이미 있으면 새 취소 없이 증빙을 저장하고 어드민 토큰으로 RPC 를 부른다", async () => {
    toss.mockResolvedValueOnce(
      json(200, {
        cancels: [{ cancelAmount: 5000, cancelReason: "[rr:7] 단순 변심" }],
      }),
    );

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ refund: { id: 7, status: "completed" } });
    expect(toss).toHaveBeenCalledTimes(1);
    expect(kit.state.updates).toEqual([
      {
        table: "refund_requests",
        values: {
          toss_cancel: expect.objectContaining({ cancelAmount: 5000 }),
        },
        filters: { id: 7 },
      },
    ]);
    expect(kit.clients).toEqual([
      { url: "https://w.supabase.co", key: "pub-key", token: "Bearer token" },
    ]);
    expect(kit.rpc).toHaveBeenCalledWith("fn_complete_refund", {
      p_refund_request_id: 7,
      p_admin_memo: null,
    });
  });

  test("취소 뒤 RPC 가 실패하면 409 이고 코드는 RPC 의 것을 쓴다", async () => {
    kit.rpc.mockResolvedValue({
      data: null,
      error: { message: "환불 완료된 주문", code: "WC039" },
    });

    const r = await call({ refundRequestId: 7 });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "WC039", detail: "환불 완료된 주문" });
  });

  test("RPC 오류에 코드가 없으면 REFUND_COMPLETE_FAILED", async () => {
    kit.rpc.mockResolvedValue({ data: null, error: { message: "실패" } });

    const r = await call({ refundRequestId: 7 });

    expect(r.body).toMatchObject({ code: "REFUND_COMPLETE_FAILED" });
  });
});
