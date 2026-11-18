import { describe, expect, test } from "vitest";
import {
  isPwnedAuthError,
  PASSWORD_PWNED_CODE,
  PWNED_PASSWORD_MESSAGE,
} from "./pwnedPassword.js";

describe("pwnedPassword", () => {
  test("응답 코드와 안내 문구는 화면과 같은 값이다", () => {
    expect(PASSWORD_PWNED_CODE).toBe("PASSWORD_PWNED");
    expect(PWNED_PASSWORD_MESSAGE).toBe(
      "유출된 적 있는 비밀번호예요. 다른 비밀번호를 입력해 주세요.",
    );
  });

  test("weak_password 이고 reasons 에 pwned 가 있으면 true", () => {
    expect(
      isPwnedAuthError({ code: "weak_password", reasons: ["pwned"] }),
    ).toBe(true);
    expect(
      isPwnedAuthError({
        name: "AuthWeakPasswordError",
        reasons: ["length", "pwned"],
      }),
    ).toBe(true);
  });

  test("pwned 가 없거나 다른 오류면 false", () => {
    expect(
      isPwnedAuthError({ code: "weak_password", reasons: ["length"] }),
    ).toBe(false);
    expect(isPwnedAuthError({ code: "weak_password" })).toBe(false);
    expect(isPwnedAuthError({ code: "other", reasons: ["pwned"] })).toBe(false);
    expect(isPwnedAuthError(null)).toBe(false);
    expect(isPwnedAuthError("pwned")).toBe(false);
  });
});
