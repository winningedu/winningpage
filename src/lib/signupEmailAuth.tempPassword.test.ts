// @vitest-environment jsdom
import { expect, test, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("./supabase", () => ({
  supabase: {
    rpc: async () => ({ data: "available", error: null }),
    auth: {
      signOut: async () => ({ error: null }),
      signUp,
    },
  },
}));

import { sendSignupEmailCode } from "./signupEmailAuth";

test("이메일 단계의 signUp 은 실제 비밀번호가 있어도 항상 임시 비밀번호를 쓴다", async () => {
  // 유출된 비밀번호가 이메일 단계에서 거부되면 안 되므로 실제 값은 여기로 오지 않는다.
  // 예전 호출부가 password 를 넘겨도 무시되는지 본다.
  const legacyParams = {
    email: "a@example.com",
    name: "홍길동",
    memberType: "student",
    password: "RealPassword1!",
  };

  await sendSignupEmailCode(legacyParams);

  const [{ password }] = signUp.mock.calls[0] as unknown as [
    { password: string },
  ];
  expect(password).not.toBe("RealPassword1!");
  expect(password).toMatch(/^Aa1!/);
});
