// QA 본사 관리자는 환불 완료 처리를 못 한다(토스 취소가 실제 돈을 움직인다).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
} from "./_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown }));

vi.mock("./_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_lib/supabaseAdmin.js")>()),
  createSupabaseAdmin: () => createFakeAdmin(kit.state as never),
}));

import handler from "./complete-refund.js";

test("QA 관리자의 환불 완료 요청은 403 QA_ACCOUNT_READ_ONLY 이고 환불 요청을 읽지도 않는다", async () => {
  const state = createKitState();
  state.user = { id: "u1", email: "u1@t.local" };
  state.rows.profiles = () => ({ role: "admin" });
  state.rows.qa_accounts = () => ({ profile_id: "u1" });
  kit.state = state;

  const r = await callHandler(
    handler as unknown as (
      req: VercelRequest,
      res: VercelResponse,
    ) => Promise<void>,
    { refundRequestId: 1 },
  );

  expect(r.status).toBe(403);
  expect(r.body).toEqual({
    error: "QA 계정이라 이 기능은 작동하지 않아요.",
    detail: "QA 계정이라 이 기능은 작동하지 않아요.",
    code: "QA_ACCOUNT_READ_ONLY",
  });
  expect(state.reads.map((read) => read.table)).not.toContain(
    "refund_requests",
  );
});
