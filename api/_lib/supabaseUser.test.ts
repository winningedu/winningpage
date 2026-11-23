import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@supabase/supabase-js");
  vi.resetModules();
});

async function loadUserClient() {
  const createClient = vi.fn(() => ({}));
  vi.resetModules();
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));
  const mod = await import("./supabaseUser.js");
  return { ...mod, createClient };
}

describe("server user-scoped Supabase client", () => {
  it("uses the publishable key and the caller's JWT as Authorization Bearer", async () => {
    vi.stubEnv("WINNING_SUPABASE_URL", "https://user-env.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    const { createSupabaseUserClient, createClient } = await loadUserClient();
    createSupabaseUserClient("user.jwt.token");

    const [url, key, options] = createClient.mock.calls[0] as unknown as [
      string,
      string,
      { global: { headers: Record<string, string> } },
    ];
    expect(url).toBe("https://user-env.example.test");
    expect(key).toBe("sb_publishable_test");
    expect(options.global.headers).toEqual({
      Authorization: "Bearer user.jwt.token",
    });
  });
});
