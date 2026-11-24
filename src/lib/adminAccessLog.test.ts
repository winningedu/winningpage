// 개인정보 반출 게이트의 검증·적재 회귀 테스트 (QA 268·270·228·223·271·269).
//
// 이 게이트가 지켜야 하는 계약은 넷이다:
//   1. 비밀번호는 **세션의 auth 이메일**로 확인한다. profiles.email 미러를 쓰면
//      이메일 변경 직후 본인인데 실패한다(전례가 있어 명시적으로 잠근다).
//   2. 사유는 공백만으로 통과하지 못한다 — "사유 필수 기재"가 요구의 핵심이다.
//   3. 적재에 실패하면 ok:false 다. 호출부가 실제 동작을 진행하지 않으므로,
//      남기지 못한 반출은 일어나지 않는다(fail-closed).
//   4. 적재는 서버 API(POST /api/admin/access-logs)가 한다. 본인 id 와 이메일은
//      서버가 토큰에서 채우므로 브라우저는 보내지 않는다.

import { beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("./http/client", async (importActual) => ({
  ...(await importActual<typeof import("./http/client")>()),
  api: { post: http.post },
}));

import {
  type AdminAccessLogClient,
  verifyAdminPassword,
  writeAdminAccessLog,
} from "./adminAccessLog";
import { ApiError } from "./http/client";

type Recorded = {
  signIn: { email: string; password: string }[];
};

function fakeClient(options: {
  user?: { id?: string; email?: string } | null;
  signInError?: unknown;
}): { client: AdminAccessLogClient; recorded: Recorded } {
  const recorded: Recorded = { signIn: [] };

  const client: AdminAccessLogClient = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? null : options.user },
        error: null,
      }),
      signInWithPassword: async (credentials) => {
        recorded.signIn.push(credentials);
        return { error: options.signInError ?? null };
      },
    },
  };

  return { client, recorded };
}

beforeEach(() => {
  http.post.mockReset();
  http.post.mockResolvedValue(new Response("{}", { status: 201 }));
});

test("비밀번호는 세션의 auth 이메일로 확인한다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await verifyAdminPassword("hunter2", client);

  expect(result).toEqual({ ok: true });
  expect(recorded.signIn).toEqual([
    { email: "session@winning.test", password: "hunter2" },
  ]);
});

test("빈 비밀번호는 재검증을 부르지 않고 즉시 막는다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await verifyAdminPassword("", client);

  expect(result.ok).toBe(false);
  expect(recorded.signIn).toHaveLength(0);
});

test("비밀번호가 틀리면 스토리지 원문 대신 안내 문구를 낸다", async () => {
  const { client } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
    signInError: { message: "Invalid login credentials" },
  });

  const result = await verifyAdminPassword("wrong", client);

  expect(result).toEqual({
    ok: false,
    message: "비밀번호가 일치하지 않습니다.",
  });
});

test("공백만 적은 사유는 적재하지 않는다", async () => {
  const result = await writeAdminAccessLog({
    action: "download",
    resourceKey: "members",
    reason: "   ",
  });

  expect(result).toEqual({ ok: false, message: "사유를 입력하세요." });
  expect(http.post).not.toHaveBeenCalled();
});

test("적재는 서버 API 로 보내고 다듬은 사유만 싣는다(본인 id 와 이메일은 보내지 않는다)", async () => {
  const result = await writeAdminAccessLog({
    action: "download",
    resourceKey: "mentorApplications",
    reason: "  제휴 심사 자료 요청  ",
    rowCount: 12,
  });

  expect(result).toEqual({ ok: true });
  expect(http.post).toHaveBeenCalledWith("admin/access-logs", {
    json: {
      action: "download",
      resourceKey: "mentorApplications",
      reason: "제휴 심사 자료 요청",
      rowCount: 12,
    },
  });
});

test("마스킹 해제는 대상 id 를 싣고 건수는 싣지 않는다", async () => {
  await writeAdminAccessLog({
    action: "unmask",
    resourceKey: "members",
    reason: "환불 문의 응대",
    targetId: "member-9",
  });

  expect(http.post).toHaveBeenCalledWith("admin/access-logs", {
    json: {
      action: "unmask",
      resourceKey: "members",
      reason: "환불 문의 응대",
      targetId: "member-9",
    },
  });
});

test("적재가 실패하면 ok:false — 호출부가 실제 동작을 진행하지 않는다", async () => {
  http.post.mockRejectedValue(
    new ApiError({ status: 500, code: "INTERNAL_ERROR", detail: "서버 오류" }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  const result = await writeAdminAccessLog({
    action: "download",
    resourceKey: "revenue",
    reason: "정산 대사",
  });

  expect(result).toEqual({
    ok: false,
    message: "접근 기록을 남기지 못해 중단했습니다. 잠시 후 다시 시도하세요.",
  });
});

test("네트워크 실패도 같은 중단 문구다", async () => {
  http.post.mockRejectedValue(
    new ApiError({ status: null, code: "NETWORK", detail: "네트워크" }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  const result = await writeAdminAccessLog({
    action: "download",
    resourceKey: "revenue",
    reason: "정산 대사",
  });

  expect(result.ok).toBe(false);
});

test("401 이면 다시 로그인하라고 안내한다", async () => {
  http.post.mockRejectedValue(
    new ApiError({
      status: 401,
      code: "UNAUTHENTICATED",
      detail: "로그인이 필요합니다.",
    }),
  );

  const result = await writeAdminAccessLog({
    action: "download",
    resourceKey: "members",
    reason: "사유",
  });

  expect(result).toEqual({
    ok: false,
    message: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
  });
});

test("세션이 없으면 비밀번호 확인을 하지 않는다", async () => {
  const { client, recorded } = fakeClient({ user: null });

  expect((await verifyAdminPassword("x", client)).ok).toBe(false);
  expect(recorded.signIn).toHaveLength(0);
});
