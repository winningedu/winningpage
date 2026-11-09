// POST /api/auth/teacher-reset-password 계약 검증(결정 103). 휴대폰 인증으로 선생님 비밀번호를 다시 정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (...names: string[]) =>
    process.env[names[0] as string] ?? "env-value",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: kit.signIn } }),
}));

import handler from "./teacher-reset-password.js";

const post = (body: unknown) => callHandler(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/auth/teacher-reset-password", () => {
  test("위닝 사이트에서는 404 이고 아무것도 읽지 않는다", async () => {
    process.env.SITE = "winning";

    const r = await post({});

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ code: "NOT_FOUND" });
    expect(kit.state.reads).toEqual([]);
  });
});
