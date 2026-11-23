// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(async (_args: unknown) => ({ error: null })),
  zone: { value: "America/New_York" },
}));

vi.mock("./supabase", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: "available", error: null })),
    auth: {
      signOut: vi.fn(async () => ({ error: null })),
      signUp: mocks.signUp,
    },
  },
}));
vi.mock("./time/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./time/zone")>()),
  browserTimeZone: () => mocks.zone.value,
}));

import { sendSignupEmailCode } from "./signupEmailAuth";

function sentMetadata() {
  const args = mocks.signUp.mock.calls[0]?.[0] as {
    options: { data: Record<string, unknown> };
  };
  return args.options.data;
}

beforeEach(() => {
  mocks.signUp.mockClear();
});

test("가입 메일을 보낼 때 브라우저 시간대를 signUp 메타데이터에 싣는다", async () => {
  mocks.zone.value = "America/New_York";
  await sendSignupEmailCode({
    email: "a@example.com",
    name: "김학생",
    memberType: "student",
  });

  expect(sentMetadata().time_zone).toBe("America/New_York");
});

test("유효하지 않은 시간대는 싣지 않는다", async () => {
  mocks.zone.value = "KST";
  await sendSignupEmailCode({
    email: "a@example.com",
    name: "김학생",
    memberType: "student",
  });

  expect(sentMetadata()).not.toHaveProperty("time_zone");
});
