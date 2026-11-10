// QA 계정의 주문은 토스 승인을 부르지 않는다(실제 돈이 움직이고 환불 업무가 생긴다).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./confirm-payment.js";

const post = () =>
  callHandler(
    handler as unknown as (
      req: VercelRequest,
      res: VercelResponse,
    ) => Promise<void>,
    { paymentKey: "pk", orderId: "order_1", amount: 9000 },
  );

beforeEach(() => {
  vi.stubEnv("TOSS_SECRET_KEY", "test_sk");
  vi.stubGlobal("fetch", vi.fn());
  kit.state = createKitState();
  kit.state.rows.orders = () => ({
    id: "order_1",
    user_id: "student-1",
    parent_profile_id: "parent-1",
    amount: 9000,
    status: "pending",
    approval_status: "approved",
    payment_key: null,
    paid_at: null,
    raw: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test.each([
  ["결제 대상 학생", "student-1"],
  ["결제하는 학부모", "parent-1"],
])("%s 가 QA 계정이면 403 이고 토스를 부르지 않는다", async (_who, qaId) => {
  kit.state.rows.qa_accounts = (filters) =>
    filters.profile_id === qaId ? { profile_id: qaId } : null;

  const r = await post();

  expect(r.status).toBe(403);
  expect(r.body).toEqual({
    error: "QA 계정이라 이 기능은 작동하지 않아요.",
    detail: "QA 계정이라 이 기능은 작동하지 않아요.",
    code: "QA_ACCOUNT_RESTRICTED",
  });
  expect(fetch).not.toHaveBeenCalled();
});

test("QA 계정이 아니면 토스 승인까지 진행한다", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ code: "REJECT", message: "x" }),
  } as Response);

  await post();

  expect(fetch).toHaveBeenCalled();
});
