// 메뉴 키 목록과 권한 레벨. 화면 라우트, 사이드바, 서버 permission.key 가 같은 목록을 쓴다.

import { describe, expect, test } from "vitest";
import { ADMIN_LEVELS, ADMIN_MENU_KEYS, isAdminLevel } from "./menu.js";

describe("ADMIN_MENU_KEYS", () => {
  test("중복이 없다", () => {
    expect(new Set(ADMIN_MENU_KEYS).size).toBe(ADMIN_MENU_KEYS.length);
  });

  test("별칭 메뉴와 대상 메뉴가 함께 있다", () => {
    expect(ADMIN_MENU_KEYS).toEqual(
      expect.arrayContaining(["memberPurge", "memberPurgeLogs", "tenants"]),
    );
  });
});

describe("ADMIN_LEVELS", () => {
  test("view 와 edit 두 단계다", () => {
    expect(ADMIN_LEVELS).toEqual(["view", "edit"]);
  });

  test("isAdminLevel 은 두 값만 받는다", () => {
    expect(["view", "edit", "none", ""].map(isAdminLevel)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
