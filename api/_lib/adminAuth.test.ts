// 목표관리 어드민 판정(resolveWinningAdmin): profiles 행은 id 로만 찾는다. 이메일이 같다고 어드민이 되지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { resolveWinningAdmin } from "./adminAuth.js";

const profiles = [
  { id: "admin-1", email: "boss@t.local", role: "admin" },
  { id: "user-2", email: null, role: "user" },
];

/** profiles 조회의 eq, or 필터를 그대로 흉내 내고 호출을 기록하는 service_role 클라이언트. */
function fakeAdmin(user: { id: string; email: string }) {
  const eq = vi.fn();
  const or = vi.fn();
  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => {
      let rows = table === "profiles" ? profiles : [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, value: unknown) => {
        eq(table, col, value);
        rows = rows.filter(
          (r) => (r as Record<string, unknown>)[col] === value,
        );
        return chain;
      };
      chain.or = (filter: string) => {
        or(table, filter);
        const email = filter.match(/email\.ilike\.([^,]+)/)?.[1];
        rows = rows.filter(
          (r) => r.id === user.id || (email && r.email === email),
        );
        return chain;
      };
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더처럼 await 할 수 있어야 한다.
      chain.then = (resolve: (r: unknown) => unknown) =>
        resolve({ data: rows, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, eq, or };
}

const req = { method: "GET", headers: { authorization: "Bearer token" } };

describe("resolveWinningAdmin", () => {
  test("이메일이 어드민과 같아도 어드민이 아닌 계정은 403 이다", async () => {
    const { client } = fakeAdmin({ id: "user-2", email: "boss@t.local" });

    const result = await resolveWinningAdmin(client, req);

    expect(result).toEqual({
      ok: false,
      status: 403,
      detail: "관리자 권한이 필요합니다.",
    });
  });

  test("profiles 는 id 로만 찾는다", async () => {
    const { client, eq, or } = fakeAdmin({
      id: "admin-1",
      email: "boss@t.local",
    });

    const result = await resolveWinningAdmin(client, req);

    expect(result).toEqual({ ok: true, userId: "admin-1" });
    expect(eq).toHaveBeenCalledWith("profiles", "id", "admin-1");
    expect(or).not.toHaveBeenCalledWith("profiles", expect.anything());
  });
});
