// POST /api/find-account-by-phone 의 accounts 응답(아이디 가림과 소속 이름).

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

import handler from "./find-account-by-phone.js";

let db: FakeDb;

const find = () => callHandler(handler as never, { phone: "010-1234-5678" });

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
          purpose: "find_account",
          consumed_at: null,
          verified_at: new Date().toISOString(),
          created_at: "2026-11-06T00:00:00Z",
        },
      ],
      profiles: [
        {
          id: "p1",
          email: "kim@example.com",
          username: "kimminsu",
          phone: "01012345678",
          member_type: "student",
          tenant_id: "t-school",
        },
        {
          id: "p2",
          email: "kim2@example.com",
          username: "abcd",
          phone: "010-1234-5678",
          member_type: "student",
          tenant_id: "t-academy",
        },
        {
          id: "p3",
          email: "old@example.com",
          username: null,
          phone: "01012345678",
          member_type: "student",
          tenant_id: null,
        },
      ],
    },
  });
  state.db = createFakeSupabase(db);
});

describe("find-account-by-phone accounts", () => {
  test("아이디는 앞 3글자만 보이고 소속 이름과 함께 나온다", async () => {
    const res = await find();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accounts: [
        { maskedId: "kim*****", tenantName: "한빛중학교" },
        { maskedId: "abc*", tenantName: "새봄학원" },
      ],
    });
  });

  test("기존 masked_email 필드는 그대로 나온다", async () => {
    const res = await find();
    expect(res.body).toMatchObject({
      found: true,
      via: "phone",
      masked_emails: [
        "ki****@ex***.com",
        "ki****@ex***.com",
        "ol****@ex***.com",
      ],
    });
  });

  test("아이디(username)가 없는 계정은 accounts 에 넣지 않는다", async () => {
    const res = await find();
    expect((res.body as { accounts: unknown[] }).accounts).toHaveLength(2);
  });

  test("소속이 없는 계정은 tenantName 이 null 이다", async () => {
    db.tables.profiles![0]!.tenant_id = null;
    const res = await find();
    expect(res.body).toMatchObject({
      accounts: [{ maskedId: "kim*****", tenantName: null }, {}],
    });
  });
});
