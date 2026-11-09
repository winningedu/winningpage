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

import { canAccessSection } from "./adminPermissions";

const tenantsView: AdminPermissionMap = new Map([["tenants", "view"]]);

beforeEach(() => {
  state.hqTenantAdmin = true;
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
