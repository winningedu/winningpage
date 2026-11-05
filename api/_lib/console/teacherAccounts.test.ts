// 교사 계정 발급 도우미 계약 검증(임시 비밀번호, scrypt 해시, Auth 사용자 생성).

import { describe, expect, test } from "vitest";
import {
  generateTempPassword,
  hashTempPassword,
  verifyTempPassword,
} from "./teacherAccounts.js";

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

describe("hashTempPassword", () => {
  test("평문을 담지 않은 salted scrypt 해시이고 같은 비밀번호도 매번 다르다", async () => {
    const first = await hashTempPassword("Abc12345!x");
    const second = await hashTempPassword("Abc12345!x");

    expect(first).toMatch(/^scrypt\$/);
    expect(first).not.toContain("Abc12345!x");
    expect(first).not.toBe(second);
  });

  test("verifyTempPassword 는 같은 비밀번호만 맞다고 한다", async () => {
    const stored = await hashTempPassword("Abc12345!x");

    expect(await verifyTempPassword("Abc12345!x", stored)).toBe(true);
    expect(await verifyTempPassword("Abc12345!y", stored)).toBe(false);
    expect(await verifyTempPassword("Abc12345!x", "garbage")).toBe(false);
  });
});
