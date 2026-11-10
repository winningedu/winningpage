// QA 계정 보호: 관리자 판정 함수가 QA 관리자의 쓰기 요청만 막는지 본다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { resolveAdmin, resolveWinningAdmin } from "./adminAuth.js";

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
