import { beforeEach, expect, test, vi } from "vitest";

vi.mock("./supabase", () => ({
  supabase: {
    rpc: async () => ({ data: "available", error: null }),
    auth: {
      signOut: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
    },
  },
}));

import { sendSignupEmailCode } from "./signupEmailAuth";

beforeEach(() => {
  localStorage.clear();
});

test("가입 전 이전 세션을 끊을 때 학습진단 초안을 지우고 다른 키는 둔다", async () => {
  localStorage.setItem("diagnosis-draft:u1", "{}");
  localStorage.setItem("other-key", "keep");

  await sendSignupEmailCode({
    email: "a@example.com",
    name: "홍길동",
    memberType: "student",
  });

  expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
  expect(localStorage.getItem("other-key")).toBe("keep");
});
