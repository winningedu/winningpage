// defineHandler 가 QA 계정 차단을 403 응답으로 바꾸는지 검증한다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("./supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { defineHandler } from "./handler.js";
import { assertNotQaAccount, assertQaAdminMayWrite } from "./qaAccount.js";

const QA_MESSAGE = "QA 계정이라 이 기능은 작동하지 않아요.";

const adminRoute = defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "detail",
  unhandledMessage: "실패",
  handler: async (_req, res) => {
    res.status(200).json({ ok: true });
  },
});

const adminCodedRoute = defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "coded",
  unhandledMessage: "실패",
  handler: async (_req, res) => {
    res.status(200).json({ ok: true });
  },
});

const guardedWriteRoute = defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "detail",
  unhandledMessage: "실패",
  handler: async (_req, res, ctx) => {
    await assertQaAdminMayWrite(ctx.supabaseAdmin, ctx.userId as string);
    res.status(200).json({ ok: true });
  },
});

const restrictedRoute = defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  unhandledMessage: "실패",
  handler: async (_req, res, ctx) => {
    await assertNotQaAccount(ctx.supabaseAdmin, ctx.userId as string);
    res.status(200).json({ ok: true });
  },
});

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "u1", email: "u1@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
});

const markQa = () => {
  kit.state.rows.qa_accounts = () => ({ profile_id: "u1" });
};

describe("auth:admin 라우트", () => {
  test("QA 관리자의 POST 는 403 이고 바디에 code 와 detail 이 최상위로 실린다", async () => {
    markQa();

    const r = await callHandler(adminRoute, {});

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      detail: QA_MESSAGE,
      code: "QA_ACCOUNT_READ_ONLY",
    });
  });

  test("errorShape 가 coded 여도 최상위 code 와 detail 이 함께 실린다", async () => {
    markQa();

    const r = await callHandler(adminCodedRoute, {});

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      error: { code: "QA_ACCOUNT_READ_ONLY", message: QA_MESSAGE },
      code: "QA_ACCOUNT_READ_ONLY",
      detail: QA_MESSAGE,
    });
  });

  test("QA 관리자의 GET 은 통과한다", async () => {
    markQa();

    const r = await callHandler(adminRoute, undefined, "GET");

    expect(r.status).toBe(200);
  });

  test("QA 가 아닌 관리자의 POST 는 통과한다", async () => {
    const r = await callHandler(adminRoute, {});

    expect(r.status).toBe(200);
  });
});

describe("라우트 안에서 던진 QA 차단", () => {
  test("assertQaAdminMayWrite: QA 관리자는 403 QA_ACCOUNT_READ_ONLY", async () => {
    markQa();

    const r = await callHandler(guardedWriteRoute, {});

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      detail: QA_MESSAGE,
      code: "QA_ACCOUNT_READ_ONLY",
    });
  });

  test("assertQaAdminMayWrite: QA 가 아니면 통과한다", async () => {
    const r = await callHandler(guardedWriteRoute, {});

    expect(r.status).toBe(200);
  });

  test("assertNotQaAccount: QA 계정은 403 QA_ACCOUNT_RESTRICTED", async () => {
    markQa();

    const r = await callHandler(restrictedRoute, {});

    expect(r.status).toBe(403);
    expect(r.body).toEqual({
      error: { code: "QA_ACCOUNT_RESTRICTED", message: QA_MESSAGE },
      code: "QA_ACCOUNT_RESTRICTED",
      detail: QA_MESSAGE,
    });
  });
});
