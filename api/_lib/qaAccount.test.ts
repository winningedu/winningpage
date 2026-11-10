// QA 계정 보호: 관리자 판정 함수가 QA 관리자의 쓰기 요청만 막는지 본다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveAdmin, resolveWinningAdmin } from "./adminAuth.js";
import { assertNotQaAccount } from "./qaAccount.js";

interface World {
  qa: boolean;
  role: string;
}

/** 필요한 만큼만 흉내 낸 service_role 클라이언트. qa_accounts, profiles 두 테이블만 읽는다. */
function fakeAdmin(world: World): SupabaseClient {
  const rowsOf = (table: string) => {
    if (table === "qa_accounts") return world.qa ? [{ profile_id: "u1" }] : [];
    if (table === "profiles")
      return [{ id: "u1", email: "u1@t.local", role: world.role }];
    return [];
  };
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "u1", email: "u1@t.local" } },
        error: null,
      }),
    },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.or = () => chain;
      chain.maybeSingle = async () => ({
        data: rowsOf(table)[0] ?? null,
        error: null,
      });
      // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더처럼 await 할 수 있어야 한다.
      chain.then = (resolve: (r: unknown) => unknown) =>
        resolve({ data: rowsOf(table), error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const req = (method: string) => ({
  method,
  headers: { authorization: "Bearer token" },
});

describe.each([
  ["resolveAdmin", resolveAdmin],
  ["resolveWinningAdmin", resolveWinningAdmin],
])("%s", (_name, resolve) => {
  test("QA 관리자의 쓰기 요청은 403 QA_ACCOUNT_READ_ONLY 로 막는다", async () => {
    const result = await resolve(
      fakeAdmin({ qa: true, role: "admin" }),
      req("POST"),
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "QA_ACCOUNT_READ_ONLY",
      detail: "QA 계정이라 이 기능은 작동하지 않아요.",
    });
  });

  test("QA 관리자의 GET 은 통과한다", async () => {
    const result = await resolve(
      fakeAdmin({ qa: true, role: "admin" }),
      req("GET"),
    );

    expect(result).toEqual({ ok: true, userId: "u1" });
  });

  test("QA 가 아닌 관리자의 쓰기 요청은 그대로 통과한다", async () => {
    const result = await resolve(
      fakeAdmin({ qa: false, role: "admin" }),
      req("POST"),
    );

    expect(result).toEqual({ ok: true, userId: "u1" });
  });

  test("관리자가 아니면 QA 여부와 상관없이 기존처럼 403 관리자 권한 문구다", async () => {
    const result = await resolve(
      fakeAdmin({ qa: true, role: "user" }),
      req("POST"),
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      detail: "관리자 권한이 필요합니다.",
    });
  });
});

// 차단 스위치: QA_ACCOUNT_GUARD_ENABLED 가 "true" 일 때만 막는다(vitest.config.ts 가 기본으로 "true" 를 깐다).
describe("QA_ACCOUNT_GUARD_ENABLED", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    ["없음", undefined],
    ["빈 값", ""],
    ["false", "false"],
    ["1", "1"],
  ])("값이 %s 이면 QA 계정도 막지 않는다", async (_label, value) => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", value);

    const admin = await resolveAdmin(
      fakeAdmin({ qa: true, role: "admin" }),
      req("POST"),
    );
    expect(admin).toEqual({ ok: true, userId: "u1" });
    await expect(
      assertNotQaAccount(fakeAdmin({ qa: true, role: "user" }), "u1"),
    ).resolves.toBeUndefined();
  });

  test.each(["true", " TRUE ", "True"])(
    "값이 '%s' 이면 QA 계정을 막는다",
    async (value) => {
      vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", value);

      const admin = await resolveAdmin(
        fakeAdmin({ qa: true, role: "admin" }),
        req("POST"),
      );
      expect(admin).toMatchObject({ ok: false, code: "QA_ACCOUNT_READ_ONLY" });
      await expect(
        assertNotQaAccount(fakeAdmin({ qa: true, role: "user" }), "u1"),
      ).rejects.toMatchObject({ code: "QA_ACCOUNT_RESTRICTED" });
    },
  );

  test("스위치가 꺼져 있어도 QA 가 아닌 계정은 그대로다", async () => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "false");

    const admin = await resolveAdmin(
      fakeAdmin({ qa: false, role: "admin" }),
      req("POST"),
    );
    expect(admin).toEqual({ ok: true, userId: "u1" });
  });
});
