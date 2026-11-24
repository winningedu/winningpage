import { afterEach, describe, expect, it, vi } from "vitest";

const E2E_KEYS = [
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_PUBLISHABLE_KEY",
  "E2E_SUPABASE_SECRET_KEY",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

// supabaseEnv 는 모듈 레벨 캐시를 쓰므로 케이스마다 모듈을 새로 불러온다.
async function loadEnv() {
  vi.resetModules();
  return import("./env");
}

function stubE2eEnv(values: Record<string, string>) {
  for (const k of E2E_KEYS) vi.stubEnv(k, values[k] ?? "");
}

describe("e2e supabaseEnv", () => {
  it("reads the publishable and secret keys from the three E2E env vars", async () => {
    stubE2eEnv({
      E2E_SUPABASE_URL: "http://127.0.0.1:54321/",
      E2E_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      E2E_SUPABASE_SECRET_KEY: "sb_secret_test",
    });

    const { supabaseEnv } = await loadEnv();

    expect(supabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
    });
  });

  it("falls back to PUBLISHABLE_KEY and SECRET_KEY of `supabase status -o env`", async () => {
    stubE2eEnv({});
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(
        () =>
          'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="sb_publishable_status"\nSECRET_KEY="sb_secret_status"\n',
      ),
    }));

    const { supabaseEnv } = await loadEnv();

    expect(supabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_status",
      secretKey: "sb_secret_status",
    });
  });

  it("fails when only some of the three values are given", async () => {
    stubE2eEnv({ E2E_SUPABASE_URL: "http://127.0.0.1:54321" });

    const { supabaseEnv } = await loadEnv();

    expect(() => supabaseEnv()).toThrow(/함께 준다/);
  });
});

describe("e2e ensureAuthUser", () => {
  it("sends the secret key on the apikey header only, never as Bearer", async () => {
    stubE2eEnv({
      E2E_SUPABASE_URL: "http://127.0.0.1:54321",
      E2E_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      E2E_SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { ensureAuthUser } = await loadEnv();
    await ensureAuthUser("e2e@winning.test", "pw");

    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(calledUrl).toBe("http://127.0.0.1:54321/auth/v1/admin/users");
    expect(init.headers.apikey).toBe("sb_secret_test");
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});
