// 교사 계정 발급 도우미 계약 검증(임시 비밀번호, scrypt 해시, Auth 사용자 생성).

import { describe, expect, test } from "vitest";
import { generateTempPassword } from "./teacherAccounts.js";

describe("generateTempPassword", () => {
  test("10자이고 영문자, 숫자, 기호를 모두 포함한다", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toHaveLength(10);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });
});
