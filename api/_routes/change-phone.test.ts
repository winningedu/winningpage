// POST /api/change-phone 의 번호 중복 검사.
// 전역 번호 유일 인덱스가 기관별 인덱스로 바뀌어 DB 가 더 이상 전역 중복을 막지 않으므로
// 핸들러가 직접 본다: 스쿨멘토는 같은 기관 안(소속 없음은 소속 없는 계정끼리), 그 밖의 사이트는 전체.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "../_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import handler from "./change-phone.js";

let db: FakeDb;

const profile = (id: string) => db.tables.profiles?.find((p) => p.id === id);

const change = (body: Record<string, unknown> = {}) =>
  callHandler(
    handler as never,
    { phone: "010-1234-5678", ...body },
    { authorization: "Bearer token" },
  );

function setup(
  me: { tenant_id: string | null },
  others: Record<string, unknown>[],
) {
  db = createFakeDb({
    tables: {
      phone_verifications: [
        {
          id: "v1",
          phone: "01012345678",
          purpose: "phone_change",
          consumed_at: null,
          verified_at: "2026-11-06T00:00:00Z",
          expires_at: "2999-01-01T00:00:00Z",
          created_at: "2026-11-06T00:00:00Z",
        },
      ],
      profiles: [
        {
          id: "me",
          phone: "010-0000-0000",
          member_type: "student",
          ...me,
        },
        ...others,
      ],
    },
  });
  const supabase = createFakeSupabase(db);
  Object.assign(supabase.auth, {
    getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
  });
  state.db = supabase;
}

const other = (tenant_id: string | null, phone = "01012345678") => ({
  id: "other",
  phone,
  member_type: "student",
  tenant_id,
});

beforeEach(() => {
  process.env.SITE = "schoolmentor";
});

describe("change-phone 번호 중복", () => {
  test("스쿨멘토: 같은 기관에 있는 번호면 409 phone_taken 이고 바꾸지 않는다", async () => {
    setup({ tenant_id: "t1" }, [other("t1", "010-1234-5678")]);

    const res = await change();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ reason: "phone_taken" });
    expect(profile("me")?.phone).toBe("010-0000-0000");
    expect(db.tables.phone_verifications?.[0]?.consumed_at).toBeNull();
  });

  test("스쿨멘토: 다른 기관에만 있는 번호는 바꿀 수 있다", async () => {
    setup({ tenant_id: "t1" }, [other("t2")]);

    const res = await change();

    expect(res.status).toBe(200);
    expect(profile("me")?.phone).toBe("010-1234-5678");
  });

  test("스쿨멘토: 소속 없는 계정은 소속 없는 계정끼리만 중복을 본다", async () => {
    setup({ tenant_id: null }, [other("t2")]);
    expect((await change()).status).toBe(200);

    setup({ tenant_id: null }, [other(null)]);
    expect((await change()).status).toBe(409);
  });

  test("위닝: 다른 기관에 있어도 전체에서 중복으로 막는다", async () => {
    process.env.SITE = "winning";
    setup({ tenant_id: "t1" }, [other("t2")]);

    const res = await change();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ reason: "phone_taken" });
  });

  test("내 현재 번호와 같은 번호로 바꾸는 것은 중복이 아니다", async () => {
    setup({ tenant_id: "t1" }, []);
    Object.assign(profile("me") ?? {}, { phone: "01012345678" });

    expect((await change()).status).toBe(200);
  });

  test("학부모 번호(target guardian)는 중복 검사 대상이 아니다", async () => {
    setup({ tenant_id: "t1" }, [other("t1")]);
    Object.assign(db.tables.phone_verifications?.[0] ?? {}, {
      purpose: "guardian_change",
    });

    const res = await change({ target: "guardian" });

    expect(res.status).toBe(200);
  });
});
