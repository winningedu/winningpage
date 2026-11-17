// POST /api/find-account-by-phone 의 accounts 응답(아이디 가림과 소속 이름).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
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
  test("계정마다 가린 이메일과 소속 이름이 나오고 아이디는 나오지 않는다", async () => {
    const res = await find();
    expect(res.status).toBe(200);
    expect((res.body as { accounts: unknown[] }).accounts).toEqual([
      { maskedEmail: "ki****@ex***.com", tenantName: "한빛중학교" },
      { maskedEmail: "ki****@ex***.com", tenantName: "새봄학원" },
      { maskedEmail: "ol****@ex***.com", tenantName: null },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/kimminsu|kim\*\*\*/);
  });

  test("선생님 계정은 가린 로그인 아이디만 나오고 합성 이메일은 나오지 않는다", async () => {
    db.tables.profiles?.push({
      id: "p4",
      email: "teach012345678@teacher.schoolmentor.kr",
      username: "teach012345678",
      phone: "01012345678",
      member_type: "teacher",
      tenant_id: "t-school",
    });
    const res = await find();
    expect((res.body as { accounts: unknown[] }).accounts[3]).toEqual({
      maskedId: "tea***********",
      tenantName: "한빛중학교",
    });
    expect(
      JSON.stringify((res.body as { accounts: unknown[] }).accounts),
    ).not.toContain("teacher.schoolmentor.kr");
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
});
