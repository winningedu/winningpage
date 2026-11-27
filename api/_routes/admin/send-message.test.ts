// POST /api/admin/send-message 계약 검증. members 수정 권한이 있는 관리자만 회원에게 자유 문구 문자를 보낸다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sendMessageResultSchema } from "../../../shared/send-message/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  send: null as unknown as (args: Record<string, unknown>) => Promise<unknown>,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => {
    const base = createFakeAdmin(kit.state);
    return {
      ...base,
      // 가짜의 insert 는 select 를 이어 붙이지 못해, 이력 id(42)를 돌려주는 체인을 얹는다.
      from: (table: string) => {
        const chain = base.from(table) as unknown as Record<
          string,
          (row: unknown) => Promise<unknown>
        >;
        const insert = chain.insert as (row: unknown) => Promise<unknown>;
        chain.insert = (row: unknown) =>
          Object.assign(insert(row), {
            select: () => ({
              maybeSingle: async () => ({ data: { id: 42 }, error: null }),
            }),
          }) as never;
        return chain as never;
      },
    };
  },
  getEnv: (name: string) => process.env[name],
}));

vi.mock("../../_lib/messaging/aligo.js", () => ({
  sendPlainMessage: (args: Record<string, unknown>) => kit.send(args),
}));

import { app } from "../app.js";

const handler = { app, path: "/api/admin/send-message" };

const post = (body: unknown, method = "POST") =>
  callRoute(handler, { method, body });

const sent: Record<string, unknown>[] = [];

function grant(level: "view" | "edit" | "none") {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: level === "none" ? [] : [{ resource_key: "members", level }],
    error: null,
  });
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "admin-1", email: "admin@example.com" };
  // 로그인한 관리자 행(role)과 수신자 번호 조회가 같은 profiles 읽기를 쓴다.
  kit.state.rows.profiles = () => ({ role: "admin", phone: "010-1234-5678" });
  kit.state.rows.qa_accounts = () => null;
  grant("edit");
  sent.length = 0;
  kit.send = async (args) => {
    sent.push(args);
    return {
      ok: true,
      channel: "sms",
      providerCode: 1,
      providerMessage: "success",
      messageId: "m-1",
    };
  };
  kit.state.insertError = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/send-message", () => {
  test("edit 권한이면 번호를 profile 에서 읽어 보내고 이력을 남기고 channel 과 logId 를 돌려준다", async () => {
    const r = await post({ profileId: "p-1", text: " 안녕하세요 " });

    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toEqual({ channel: "sms", logId: 42 });
    expect(sendMessageResultSchema.safeParse(r.body).success).toBe(true);
    expect(r.body).not.toHaveProperty("ok");
    expect(sent).toEqual([
      { phone: "01012345678", text: "안녕하세요", subject: "위닝에듀 안내" },
    ]);
    expect(kit.state.inserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "alimtalk_send_logs",
      row: {
        template_key: "manualMessage",
        channel: "sms",
        profile_id: "p-1",
        phone: "01012345678",
        subject: "위닝에듀 안내",
        message: "안녕하세요",
        status: "sent",
        provider_code: "1",
        provider_message: "success",
        provider_msg_id: "m-1",
        meta: { sentBy: "admin-1" },
      },
    });
  });

  test("화면이 번호를 주면 숫자만 남겨 쓰고 profile 을 읽지 않는다", async () => {
    await post({ phone: "010-9999-8888", text: "x", subject: " 공지 " });

    expect(sent[0]).toMatchObject({ phone: "01099998888", subject: "공지" });
    expect(kit.state.inserts[0]?.row).toMatchObject({ profile_id: null });
  });

  test("view 권한만 있으면 403 이고 보내지도 남기지도 않는다", async () => {
    grant("view");

    const r = await post({ profileId: "p-1", text: "x" });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(sent).toHaveLength(0);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("권한이 없으면 403", async () => {
    grant("none");

    expect((await post({ profileId: "p-1", text: "x" })).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  test("QA 계정은 보내지 못한다", async () => {
    kit.state.rows.qa_accounts = () => ({ profile_id: "admin-1" });

    const r = await post({ profileId: "p-1", text: "x" });

    expect(r.status).toBe(403);
    expect(sent).toHaveLength(0);
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("공백뿐인 내용은 400 이다", async () => {
    const r = await post({ profileId: "p-1", text: "   " });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "보낼 내용을 입력해 주세요." });
    expect(sent).toHaveLength(0);
  });

  test("번호도 profile 번호도 없으면 400 이다", async () => {
    kit.state.rows.profiles = () => ({ role: "admin", phone: null });

    const r = await post({ profileId: "p-1", text: "x" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ detail: "수신자 연락처가 없습니다." });
    expect(sent).toHaveLength(0);
  });

  test.each([
    ["본문 없음", undefined],
    ["text 없음", { profileId: "p-1" }],
    ["문자열이 아닌 text", { text: 3 }],
  ])("%s 이면 400 VALIDATION_FAILED", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(sent).toHaveLength(0);
  });

  test("업체가 실패를 돌려주면 500 SEND_FAILED 이고 실패 이력을 남긴다", async () => {
    kit.send = async () => ({
      ok: false,
      channel: "sms",
      providerCode: -101,
      providerMessage: "인증오류",
      messageId: null,
    });

    const r = await post({ profileId: "p-1", text: "x" });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "SEND_FAILED",
      detail: "발송 실패: 인증오류",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      status: "failed",
      provider_message: "인증오류",
    });
  });

  test("발송이 예외를 던지면 500 SEND_FAILED 이고 예외 메시지를 이력에 남긴다", async () => {
    kit.send = async () => {
      throw new Error("proxy down");
    };

    const r = await post({ profileId: "p-1", text: "x" });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({
      code: "SEND_FAILED",
      detail: "발송 실패: proxy down",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      channel: "sms",
      status: "failed",
      provider_code: null,
      provider_message: "proxy down",
    });
  });

  test("POST 이외의 메서드는 405 이고 Allow 가 POST 다", async () => {
    const r = await post(undefined, "GET");

    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("POST");
    expect(sent).toHaveLength(0);
  });
});
