// 계약 종료 회원 삭제 메뉴 키는 기존 tenants 권한을 같이 쓴다(결정 102.8, 스쿨멘토만).

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminPermissionMap } from "./adminPermissions";

const state = vi.hoisted(() => ({ hqTenantAdmin: true }));

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get hqTenantAdmin() {
        return state.hqTenantAdmin;
      },
    },
  },
}));

vi.mock("./supabase", () => ({
  supabase: { auth: { onAuthStateChange: () => ({}) } },
}));

const http = vi.hoisted(() => ({
  payload: {} as unknown,
  get: vi.fn(),
}));

vi.mock("./http/client", () => ({
  api: { get: http.get },
}));

import {
  adminPermissionsQueryOptions,
  canAccessSection,
} from "./adminPermissions";

const tenantsView: AdminPermissionMap = new Map([["tenants", "view"]]);

beforeEach(() => {
  state.hqTenantAdmin = true;
  http.get.mockReset();
  http.get.mockImplementation(() => ({
    json: async (schema: { parse: (v: unknown) => unknown }) =>
      schema.parse(http.payload),
  }));
});

describe("adminPermissionsQueryOptions", () => {
  test("키에 사용자 id 를 넣고 15초 동안 신선하게 둔다", () => {
    const options = adminPermissionsQueryOptions("u1");

    expect(options.queryKey).toEqual(["admin", "me", "permissions", "u1"]);
    expect(options.staleTime).toBe(15_000);
  });

  test("응답의 권한 객체를 맵으로 바꾼다", async () => {
    http.payload = {
      permissions: { popups: "edit", banners: "view" },
      isSuper: true,
    };
    const signal = new AbortController().signal;

    const options = adminPermissionsQueryOptions("u1");
    const result = await (
      options.queryFn as (ctx: { signal: AbortSignal }) => Promise<unknown>
    )({ signal });

    expect(http.get).toHaveBeenCalledWith("admin/me/permissions", { signal });
    expect(result).toEqual({
      permissions: new Map([
        ["popups", "edit"],
        ["banners", "view"],
      ]),
      isSuper: true,
    });
  });

  test("모르는 level 이 오면 스키마 오류로 던진다", async () => {
    http.payload = { permissions: { popups: "none" }, isSuper: false };

    const options = adminPermissionsQueryOptions("u1");

    await expect(
      (options.queryFn as (ctx: { signal: AbortSignal }) => Promise<unknown>)({
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });

  test("4xx 는 다시 시도하지 않는다", () => {
    expect(adminPermissionsQueryOptions("u1").retry).toBe(false);
  });
});

describe("canAccessSection 별칭 키", () => {
  test.each(["memberPurge", "memberPurgeLogs"])(
    "%s 는 tenants 권한을 따른다",
    (key) => {
      expect(canAccessSection(tenantsView, false, key)).toBe(true);
      expect(canAccessSection(new Map(), false, key)).toBe(false);
    },
  );

  test("별칭이 없는 키는 그대로 자기 키만 본다", () => {
    expect(canAccessSection(tenantsView, false, "members")).toBe(false);
  });

  test("위닝(hqTenantAdmin 꺼짐)에서는 tenants 권한이 있어도 열리지 않는다", () => {
    state.hqTenantAdmin = false;

    expect(canAccessSection(tenantsView, false, "memberPurge")).toBe(false);
    expect(canAccessSection(tenantsView, true, "memberPurgeLogs")).toBe(false);
    expect(canAccessSection(tenantsView, false, "tenants")).toBe(true);
  });
});
