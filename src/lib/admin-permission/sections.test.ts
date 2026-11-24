// 메뉴 권한 규칙(최고 관리자 전용, 별칭)은 화면과 서버가 같은 모듈을 쓴다.

import { describe, expect, test } from "vitest";
import { isSuperOnlySection, permissionKeyFor } from "./sections.js";

describe("isSuperOnlySection", () => {
  test.each(["adminMembers", "adminRoles"])("%s 는 최고 관리자 전용이다", (key) => {
    expect(isSuperOnlySection(key)).toBe(true);
  });

  test("일반 메뉴는 아니다", () => {
    expect(isSuperOnlySection("members")).toBe(false);
  });
});

describe("permissionKeyFor", () => {
  test.each(["memberPurge", "memberPurgeLogs"])(
    "%s 는 hqTenantAdmin 이 켜져 있으면 tenants 권한을 본다",
    (key) => {
      expect(permissionKeyFor(key, true)).toBe("tenants");
    },
  );

  test("hqTenantAdmin 이 꺼져 있으면 별칭 메뉴는 열 키가 없다", () => {
    expect(permissionKeyFor("memberPurge", false)).toBeNull();
    expect(permissionKeyFor("memberPurgeLogs", false)).toBeNull();
  });

  test("별칭이 없는 키는 플래그와 무관하게 자기 키다", () => {
    expect(permissionKeyFor("tenants", false)).toBe("tenants");
    expect(permissionKeyFor("members", true)).toBe("members");
  });
});
