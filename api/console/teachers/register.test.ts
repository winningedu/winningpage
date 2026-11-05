// POST /api/console/teachers/register 계약 검증(W14b). 가짜 service_role 클라이언트는 consoleTestKit.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./register.js";

type Captured = { status: number; body: unknown };

async function post(body: unknown): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const VALID = {
  name: "김교사",
  phone: "010-1234-5678",
  classes: [{ grade: "고1", name: "3반" }],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rpc.fn_teacher_register = () => ({
    data: [{ teacher_id: "teacher-1", verdict: "created" }],
    error: null,
  });
  kit.state.rows.teachers = (filters) =>
    filters.id === "teacher-1"
      ? {
          login_id: "ABCD2345XY7Z9K",
          profile_id: null,
          temp_password_issued_at: "2026-11-05T05:00:00Z",
        }
      : null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/register", () => {
  test("신규 교사는 등록하고 합성 이메일 계정을 만들어 임시 비밀번호를 한 번 돌려준다", async () => {
    const r = await post(VALID);

    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      teacherId: "teacher-1",
      loginId: "ABCD2345XY7Z9K",
      verdict: "created",
    });
    expect(body.tempPassword).toHaveLength(10);
    expect(kit.state.auth.createUser).toHaveBeenCalledWith({
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: body.tempPassword,
      email_confirm: true,
    });
  });
});
