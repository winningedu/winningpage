// POST /api/signup/username-check 계약 검증(스쿨멘토 가입 아이디 중복 확인).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { callSignup } from "../../_lib/signup/signupTestKit.js";
import handler from "./username-check.js";

const post = (body: unknown) => callSignup(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/signup/username-check", () => {
  test("SITE 가 schoolmentor 가 아니면 404 이고 조회하지 않는다", async () => {
    delete process.env.SITE;
    const check = vi.fn();
    kit.state.rpc.is_username_available = check;

    const r = await post({ username: "student01" });

    expect(r.status).toBe(404);
    expect(check).not.toHaveBeenCalled();
  });

  test("형식에 맞는 아이디는 소문자로 맞춰 묻고 결과를 돌려준다", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.is_username_available = (args) => {
      calls.push(args);
      return { data: false, error: null };
    };

    const r = await post({ username: " Student01 " });

    expect(calls).toEqual([{ check_username: "student01" }]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ available: false });
  });

  test("형식에 맞지 않으면 400 이고 조회하지 않는다", async () => {
    const check = vi.fn();
    kit.state.rpc.is_username_available = check;

    for (const username of [
      "abc",
      "a".repeat(21),
      "stu@dent",
      "학생아이디1",
      7,
    ]) {
      const r = await post({ username });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ code: "VALIDATION", field: "username" });
    }
    expect(check).not.toHaveBeenCalled();
  });
});
