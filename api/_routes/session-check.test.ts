// classifyAuthError 분기 검증.
//
// ⚠️ 이전 버전(리뷰 CRITICAL 지적)은 `new AuthApiError(..., "session_not_found")`를
// 손으로 만들어 통과하는 허구 테스트였다 — 실제로는 auth-js의 handleError가
// GoTrue REST의 error_code:"session_not_found"를 가로채 AuthApiError가 아니라
// AuthSessionMissingError로 재포장해 던진다(session-check.ts의 classifyAuthError
// 주석 참고). 그 손으로 만든 AuthApiError는 실제 코드 경로에서 절대 나오지 않는
// 값이라, 분류 함수의 실제 버그(isAuthApiError만 검사 → 영원히 false)를 전혀
// 잡지 못했다.
//
// 그래서 이번엔 `createClient()`로 만든 진짜 GoTrueClient에 `global.fetch`를
// 대체해 GoTrue REST 응답을 흉내 내고, session-check.ts가 실제로 부르는
// `auth.getUser(jwt)`를 그대로 태워 나온 에러 객체로 classifyAuthError를
// 검증한다 — auth-js 내부 재포장까지 포함해서 검증된다.

import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { callHandler } from "../_lib/console/consoleTestKit.js";

// 핸들러 테스트용 admin 가짜: auth.getUser, profiles 의 조건부 update, profile_login_slots 의 upsert 만 흉내 낸다.
const fake = vi.hoisted(() => ({
  getUser: null as unknown as () => Promise<unknown>,
  profiles: [] as { id: string; last_seen_at: string | null }[],
  writes: [] as { id: string; at: string }[],
  updateError: null as null | { message: string },
  updateThrows: false,
  loginSlots: [] as { profile_id: string; slot_start: string }[],
  loginError: null as null | { message: string },
  loginThrows: false,
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    auth: { getUser: () => fake.getUser() },
    from: (table: string) => ({
      // 기본 키 (profile_id, slot_start) 를 흉내 낸다: ignoreDuplicates 면 on conflict do nothing, 아니면 23505.
      upsert: async (
        row: { profile_id: string; slot_start: string },
        options: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => {
        expect(table).toBe("profile_login_slots");
        if (fake.loginThrows) throw new Error("db down");
        if (fake.loginError) return { error: fake.loginError };
        expect(options.onConflict).toBe("profile_id,slot_start");
        const exists = fake.loginSlots.some(
          (r) =>
            r.profile_id === row.profile_id && r.slot_start === row.slot_start,
        );
        if (exists && !options.ignoreDuplicates) {
          return { error: { message: "duplicate key", code: "23505" } };
        }
        if (!exists) fake.loginSlots.push({ ...row });
        return { error: null };
      },
      update: (patch: { last_seen_at: string }) => ({
        eq: (_col: string, id: string) => ({
          // or("last_seen_at.is.null,last_seen_at.lt.<cutoff>")
          or: async (expr: string) => {
            expect(table).toBe("profiles");
            if (fake.updateThrows) throw new Error("db down");
            if (fake.updateError) return { error: fake.updateError };
            const cutoff = expr.split("last_seen_at.lt.")[1] as string;
            const row = fake.profiles.find((r) => r.id === id);
            if (
              row &&
              (row.last_seen_at === null || row.last_seen_at < cutoff)
            ) {
              row.last_seen_at = patch.last_seen_at;
              fake.writes.push({ id, at: patch.last_seen_at });
            }
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import handler, {
  classifyAuthError,
  SESSION_REVOKED_CODE,
  UNAUTHENTICATED_CODE,
} from "./session-check.js";

const TEST_URL = "https://test-project.supabase.co";
const TEST_KEY = "test-service-role-key";
const TEST_TOKEN = "test-jwt-token";

function createClientWithFetch(fetchStub: typeof fetch) {
  return createClient(TEST_URL, TEST_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
}

/** session-check.ts의 `ctx.supabaseAdmin.auth.getUser(token)`과 정확히 같은
 * 호출을 태워 { error }만 뽑아 돌려준다. */
async function getUserError(fetchStub: typeof fetch) {
  const client = createClientWithFetch(fetchStub);
  const { error } = await client.auth.getUser(TEST_TOKEN);
  return error;
}

describe("classifyAuthError — 실제 auth.getUser(jwt) 경로", () => {
  test("GoTrue가 error_code:session_not_found를 응답하면 SESSION_REVOKED로 분류한다", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error_code: "session_not_found",
            msg: "Session from session_id claim in JWT does not exist",
          }),
          { status: 403 },
        ),
    ) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(SESSION_REVOKED_CODE);
  });

  test("session_not_found 외 다른 GoTrue 401(예: 만료 JWT)은 UNAUTHENTICATED로 분류한다", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error_code: "bad_jwt", msg: "invalid JWT" }),
          { status: 401 },
        ),
    ) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("네트워크 오류(fetch 자체가 실패)는 UNAUTHENTICATED로 분류한다", async () => {
    const fetchStub = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const error = await getUserError(fetchStub);
    expect(classifyAuthError(error)).toBe(UNAUTHENTICATED_CODE);
  });

  test("정상 토큰(200 + user)이면 에러 없이 유저를 반환한다(분류 대상 아님)", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "user-1", email: "a@example.com" }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const { data, error } =
      await createClientWithFetch(fetchStub).auth.getUser(TEST_TOKEN);

    expect(error).toBeNull();
    expect(data.user?.id).toBe("user-1");
  });

  test("에러가 null/undefined(토큰 없음 등)여도 UNAUTHENTICATED로 분류한다", () => {
    expect(classifyAuthError(null)).toBe(UNAUTHENTICATED_CODE);
    expect(classifyAuthError(undefined)).toBe(UNAUTHENTICATED_CODE);
  });
});

describe("session-check handler: 최근 접속 기록", () => {
  const NOW = new Date("2026-11-09T12:00:00+09:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.profiles = [{ id: "u1", last_seen_at: null }];
    fake.writes = [];
    fake.updateError = null;
    fake.updateThrows = false;
    fake.loginSlots = [];
    fake.loginError = null;
    fake.loginThrows = false;
    fake.getUser = async () => ({ data: { user: { id: "u1" } }, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("유효한 토큰이면 그 사용자의 last_seen_at 을 지금으로 적는다", async () => {
    const res = await callHandler(handler, undefined, "GET");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(fake.profiles[0]?.last_seen_at).toBe(NOW.toISOString());
  });

  test("30분 안의 두 번째 호출은 다시 적지 않고, 30분이 지나면 다시 적는다", async () => {
    await callHandler(handler, undefined, "GET");
    vi.setSystemTime(new Date(NOW.getTime() + 29 * 60 * 1000));
    await callHandler(handler, undefined, "GET");
    expect(fake.writes).toHaveLength(1);

    vi.setSystemTime(new Date(NOW.getTime() + 31 * 60 * 1000));
    await callHandler(handler, undefined, "GET");
    expect(fake.writes).toHaveLength(2);
  });

  test("기록에 실패해도 응답은 200 { ok: true } 그대로다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    fake.updateError = { message: "boom" };
    const failed = await callHandler(handler, undefined, "GET");
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual({ ok: true });

    fake.updateError = null;
    fake.updateThrows = true;
    const thrown = await callHandler(handler, undefined, "GET");
    expect(thrown.status).toBe(200);
    expect(thrown.body).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("폐기된 세션은 401 SESSION_REVOKED 이고 아무것도 적지 않는다", async () => {
    const { AuthSessionMissingError } = await import("@supabase/supabase-js");
    fake.getUser = async () => ({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    const res = await callHandler(handler, undefined, "GET");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: SESSION_REVOKED_CODE } });
    expect(fake.writes).toHaveLength(0);
    expect(fake.loginSlots).toHaveLength(0);
  });
});

describe("session-check handler: 15분 칸 로그인 기록", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.profiles = [{ id: "u1", last_seen_at: null }];
    fake.writes = [];
    fake.updateError = null;
    fake.updateThrows = false;
    fake.loginSlots = [];
    fake.loginError = null;
    fake.loginThrows = false;
    fake.getUser = async () => ({ data: { user: { id: "u1" } }, error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("유효한 토큰이면 지금이 속한 15분 칸 한 줄을 남기고, 같은 칸에서 다시 불러도 한 줄이다", async () => {
    vi.setSystemTime(new Date("2026-11-22T15:31:10Z"));
    const res = await callHandler(handler, undefined, "GET");
    vi.setSystemTime(new Date("2026-11-22T15:44:59Z"));
    await callHandler(handler, undefined, "GET");

    expect(res.status).toBe(200);
    expect(fake.loginSlots).toEqual([
      { profile_id: "u1", slot_start: "2026-11-22T15:30:00.000Z" },
    ]);
  });

  test("다음 칸에 들어서면 한 줄을 더 남긴다(last_seen_at 30분 간격과 따로)", async () => {
    vi.setSystemTime(new Date("2026-11-22T15:44:00Z"));
    await callHandler(handler, undefined, "GET");
    vi.setSystemTime(new Date("2026-11-22T15:46:00Z"));
    await callHandler(handler, undefined, "GET");

    expect(fake.writes).toHaveLength(1);
    expect(fake.loginSlots.map((r) => r.slot_start)).toEqual([
      "2026-11-22T15:30:00.000Z",
      "2026-11-22T15:45:00.000Z",
    ]);
  });

  test("로그인 기록에 실패해도 응답은 200 이고 last_seen_at 은 적힌다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.setSystemTime(new Date("2026-11-09T12:00:00+09:00"));

    fake.loginError = { message: "boom" };
    const failed = await callHandler(handler, undefined, "GET");
    expect(failed.status).toBe(200);
    expect(failed.body).toEqual({ ok: true });
    expect(fake.writes).toHaveLength(1);

    fake.loginError = null;
    fake.loginThrows = true;
    const thrown = await callHandler(handler, undefined, "GET");
    expect(thrown.status).toBe(200);
    expect(thrown.body).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
