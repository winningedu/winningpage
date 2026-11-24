// 메뉴 키를 판정에 쓰는 권한 키로 바꾸는 규칙(resolvePermissionKey)을 검증한다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const flags = vi.hoisted(() => ({ hqTenantAdmin: true }));

vi.mock("./site.js", () => ({ getSiteKey: () => "schoolmentor" }));

vi.mock("../../src/config/sites.js", () => ({
  SITES: {
    schoolmentor: {
      features: {
        get hqTenantAdmin() {
          return flags.hqTenantAdmin;
        },
      },
    },
  },
}));

import { resolvePermissionKey } from "./adminPermission.js";

beforeEach(() => {
  flags.hqTenantAdmin = true;
});

describe("resolvePermissionKey", () => {
  test("일반 메뉴는 키 그대로다", () => {
    expect(resolvePermissionKey("members")).toBe("members");
  });

  test("최고 관리자 전용 메뉴는 키 그대로다", () => {
    expect(resolvePermissionKey("adminMembers")).toBe("adminMembers");
  });

  test("별칭 메뉴는 사이트 플래그가 켜져 있으면 별칭 대상 키다", () => {
    expect(resolvePermissionKey("memberPurge")).toBe("tenants");
  });

  test("별칭 메뉴는 사이트 플래그가 꺼져 있으면 null 이다", () => {
    flags.hqTenantAdmin = false;
    expect(resolvePermissionKey("memberPurge")).toBeNull();
  });
});
