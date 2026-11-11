// GET /api/console/proxy/tenants 계약 검증(W5a 학교 목록). 본사 대행 권한이 있는 관리자만 읽는다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: [] as { resource_key: string; level: string }[],
  tenants: [] as Record<string, unknown>[],
  filters: {} as Record<string, unknown>,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-1", email: "hq@example.com" } },
        error: null,
      }),
    },
    rpc: (name: string) =>
      Promise.resolve(
        name === "fn_admin_effective_permissions"
          ? { data: state.permissions, error: null }
          : { data: null, error: null },
      ),
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, value: unknown) => {
        state.filters[col] = value;
        return chain;
      };
      chain.order = () => chain;
      // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
      chain.then = (resolve: (r: unknown) => unknown) =>
        resolve({ data: state.tenants, error: null });
      return chain;
    },
  }),
}));

import { callHandler } from "../../../_lib/console/consoleTestKit.js";
import handler from "./tenants.js";

const get = () => callHandler(handler, undefined, "GET");

beforeEach(() => {
  state.permissions = [{ resource_key: "teacherConsoleProxy", level: "edit" }];
  state.filters = {};
  state.tenants = [
    { id: "t1", code: "SM26HB83", name: "한빛고등학교", org_type: "학교" },
    { id: "t2", code: "SM26HM41", name: "한빛수학학원", org_type: "학원" },
  ];
});

describe("GET /api/console/proxy/tenants", () => {
  test("a proxy-capable admin gets the school list without the catch-all tenant", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      tenants: [
        { id: "t1", code: "SM26HB83", name: "한빛고등학교" },
        { id: "t2", code: "SM26HM41", name: "한빛수학학원" },
      ],
    });
    expect(state.filters).toEqual({ is_catch_all: false });
  });

  test("an admin without teacherConsoleProxy edit gets 403 and no list", async () => {
    state.permissions = [
      { resource_key: "teacherConsoleProxy", level: "view" },
    ];

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
