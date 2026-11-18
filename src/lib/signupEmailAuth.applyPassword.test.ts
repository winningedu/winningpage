// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";

const updateUser = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("./supabase", () => ({
  supabase: { auth: { updateUser } },
}));

import { applySignupPassword } from "./signupEmailAuth";

beforeEach(() => {
  updateUser.mockClear();
});

test.each([
  ["빈 문자열", ""],
  ["null", null],
  ["undefined", undefined],
])(
  "비밀번호가 %s 이면 오류를 돌려주고 계정을 바꾸지 않는다",
  async (_name, value) => {
    const result = await applySignupPassword(value);

    expect(result.ok).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect(updateUser).not.toHaveBeenCalled();
  },
);

test("비밀번호가 있으면 계정에 반영한다", async () => {
  await expect(applySignupPassword("RealPassword1!")).resolves.toEqual({
    ok: true,
  });
  expect(updateUser).toHaveBeenCalledWith({ password: "RealPassword1!" });
});
