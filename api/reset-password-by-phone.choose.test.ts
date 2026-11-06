// POST /api/reset-password-by-phone 의 계정 고르기(chooseAccount, 스쿨멘토).
// 위닝은 새 필드를 보내지 않으므로 가장 먼저 가입한 계정 하나를 재설정하는
// 기존 동작이 그대로여야 한다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "./_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./reset-password-by-phone.js";

let db: FakeDb;

const reset = (extra: Record<string, unknown> = {}) =>
  callHandler(handler as never, { phone: "010-1234-5678", ...extra });

const verification = () => db.tables.phone_verifications?.[0];

beforeEach(() => {
  db = createFakeDb({
    tables: {
      tenants: [
        { id: "t-school", name: "한빛중학교" },
        { id: "t-academy", name: "새봄학원" },
      ],
      phone_verifications: [
        {
          id: "v1",
          phone: "01012345678",
          purpose: "reset_password",
          consumed_at: null,
          verified_at: new Date().toISOString(),
          created_at: "2026-11-06T00:00:00Z",
        },
      ],
      profiles: [
        {
          id: "p1",
          email: "first@example.com",
          username: "kimminsu",
          phone: "01012345678",
          member_type: "student",
          tenant_id: "t-school",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "p2",
          email: "second@example.com",
          username: "kimmin2",
          phone: "010-1234-5678",
          member_type: "student",
          tenant_id: "t-academy",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
    },
  });
  state.db = createFakeSupabase(db);
});

describe("reset-password-by-phone chooseAccount", () => {
  test("새 필드가 없으면 가장 먼저 가입한 계정을 재설정한다(위닝)", async () => {
    const res = await reset();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: true, via: "phone" });
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });

  test("계정이 2개 이상이고 accountId 가 없으면 409 로 고르게 하고 인증을 소비하지 않는다", async () => {
    const res = await reset({ chooseAccount: true });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "choose_account",
      accounts: [
        { accountId: "p1", maskedId: "kim*****", tenantName: "한빛중학교" },
        { accountId: "p2", maskedId: "kim****", tenantName: "새봄학원" },
      ],
    });
    expect(db.passwordUpdates).toEqual([]);
    expect(verification()?.consumed_at).toBeNull();
  });

  test("고른 accountId 의 계정만 재설정하고 인증을 소비한다", async () => {
    const res = await reset({ chooseAccount: true, accountId: "p2" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      temp_password: expect.any(String),
    });
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p2"]);
    expect(verification()?.consumed_at).not.toBeNull();
  });

  test("매치 목록에 없는 accountId 는 400 이고 아무것도 바꾸지 않는다", async () => {
    const res = await reset({ chooseAccount: true, accountId: "stranger" });
    expect(res.status).toBe(400);
    expect(db.passwordUpdates).toEqual([]);
    expect(verification()?.consumed_at).toBeNull();
  });

  test("계정이 1개면 고르게 하지 않고 바로 재설정한다", async () => {
    db.tables.profiles?.pop();
    const res = await reset({ chooseAccount: true });
    expect(res.status).toBe(200);
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });

  test("chooseAccount 없이 보낸 accountId 는 무시한다", async () => {
    const res = await reset({ accountId: "p2" });
    expect(res.status).toBe(200);
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });
});
