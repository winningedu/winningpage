import { describe, expect, test } from "vitest";
import { buildGrantBody, validateGrantForm } from "./growthGrantForm";

const ok = { profileId: "p1", sessionQuota: "3", months: "6" };

describe("validateGrantForm", () => {
  test("유효한 입력은 null", () => {
    expect(validateGrantForm(ok)).toBeNull();
  });
  test("학생 미선택", () => {
    expect(validateGrantForm({ ...ok, profileId: "" })).toBe(
      "학생을 선택해 주세요.",
    );
  });
  test("회차 수는 1 이상 정수", () => {
    for (const v of ["", "0", "-1", "1.5", "abc"]) {
      expect(validateGrantForm({ ...ok, sessionQuota: v })).toBe(
        "회차 수는 1 이상의 정수로 입력해 주세요.",
      );
    }
  });
  test("기간은 1 이상 정수(개월)", () => {
    for (const v of ["", "0", "2.5"]) {
      expect(validateGrantForm({ ...ok, months: v })).toBe(
        "기간은 1 이상의 정수(개월)로 입력해 주세요.",
      );
    }
  });
});

describe("buildGrantBody", () => {
  test("문자열 입력을 숫자로 바꿔 요청 본문을 만든다", () => {
    expect(buildGrantBody(ok)).toEqual({
      profileId: "p1",
      sessionQuota: 3,
      months: 6,
    });
  });
});
