// POST /api/create-consult-request: 로그인 없이도 쓰는 상담 신청. 토큰이 있고 QA 계정이면 접수하지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./create-consult-request.js";

const VALID = {
  name: "김상담",
  phone: "010-1234-5678",
  email: "a@b.co",
  service: "대입컨설팅 프로그램",
  message: "문의",
  agree: true,
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "u1", email: "u1@t.local" };
});

describe("POST /api/create-consult-request", () => {
  test("QA 계정이 보낸 상담 신청은 403 이고 저장하지 않는다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "u1" });

    const r = await callHandler(handler, VALID);

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      error: "QA 계정이라 이 기능은 작동하지 않아요.",
      detail: "QA 계정이라 이 기능은 작동하지 않아요.",
      code: "QA_ACCOUNT_RESTRICTED",
    });
    expect(kit.state.inserts).toEqual([]);
  });

  test("QA 가 아닌 계정의 상담 신청은 그대로 저장된다", async () => {
    const r = await callHandler(handler, VALID);

    expect(r.status).toBe(200);
    expect(kit.state.inserts.map((i) => i.table)).toEqual([
      "premium_consult_requests",
    ]);
  });
});
