import { afterEach, describe, expect, it, vi } from "vitest";

const URL_KEYS = ["WINNING_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL"];
const KEY_KEYS = ["SUPABASE_SECRET_KEY"];

function clearSupabaseEnv() {
  for (const k of [...URL_KEYS, ...KEY_KEYS]) vi.stubEnv(k, "");
}

// createSupabaseAdmin은 모듈 레벨 cache를 쓰므로 케이스마다 모듈을 새로 불러온다.
async function loadAdmin() {
  const createClient = vi.fn(() => ({}));
  vi.resetModules();
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));
  const mod = await import("./supabaseAdmin.js");
  return { ...mod, createClient };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@supabase/supabase-js");
  vi.resetModules();
});

describe("server Supabase admin client picks URL and key from the deployment env", () => {
  it.each([
    ["winning", "https://winning-env.example.test", "sb_secret_winning"],
    [
      "schoolmentor",
      "https://schoolmentor-env.example.test",
      "sb_secret_schoolmentor",
    ],
  ])(
    "%s deployment uses its own env URL and key as given",
    async (site, url, key) => {
      clearSupabaseEnv();
      vi.stubEnv("SITE", site);
      vi.stubEnv("WINNING_SUPABASE_URL", url);
      vi.stubEnv("SUPABASE_SECRET_KEY", key);

      const { createSupabaseAdmin, createClient } = await loadAdmin();
      createSupabaseAdmin();

      expect(createClient).toHaveBeenCalledTimes(1);
      const [calledUrl, calledKey] = createClient.mock.calls[0] as unknown as [
        string,
        string,
      ];
      expect(calledUrl).toBe(url);
      expect(calledKey).toBe(key);
    },
  );

  it("uses only the env URL when only the generic SUPABASE_URL is set", async () => {
    clearSupabaseEnv();
    vi.stubEnv("SUPABASE_URL", "https://generic-env.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_generic");

    const { createSupabaseAdmin, createClient } = await loadAdmin();
    createSupabaseAdmin();

    expect((createClient.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://generic-env.example.test",
    );
  });

  it("fails loudly with the config error when the URL is missing", async () => {
    clearSupabaseEnv();
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");

    const { createSupabaseAdmin, createClient, isSupabaseConfigError } =
      await loadAdmin();

    let thrown: unknown;
    try {
      createSupabaseAdmin();
    } catch (e) {
      thrown = e;
    }
    expect(isSupabaseConfigError(thrown)).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("fails loudly with the config error when the key is missing", async () => {
    clearSupabaseEnv();
    vi.stubEnv("WINNING_SUPABASE_URL", "https://x.example.test");

    const { createSupabaseAdmin, createClient, isSupabaseConfigError } =
      await loadAdmin();

    let thrown: unknown;
    try {
      createSupabaseAdmin();
    } catch (e) {
      thrown = e;
    }
    expect(isSupabaseConfigError(thrown)).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("names SUPABASE_SECRET_KEY in the config error message", async () => {
    const { SUPABASE_CONFIG_ERROR_MESSAGE } = await loadAdmin();
    expect(SUPABASE_CONFIG_ERROR_MESSAGE).toContain("SUPABASE_SECRET_KEY");
  });
});
