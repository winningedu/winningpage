import { afterEach, describe, expect, it, vi } from "vitest";

const WINNING_URL = "https://winning-env.example.test";
const SCHOOLMENTOR_URL = "https://schoolmentor-env.example.test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@supabase/supabase-js");
  vi.resetModules();
});

async function loadClientWithCapturedArgs() {
  const createClient = vi.fn(() => ({}));
  vi.resetModules();
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));
  await import("./supabase");
  return createClient.mock.calls[0] as unknown as [string, string];
}

describe("client Supabase client picks URL and key from the deployment env", () => {
  it.each([
    ["winning", WINNING_URL, "sb_publishable_winning"],
    ["schoolmentor", SCHOOLMENTOR_URL, "sb_publishable_schoolmentor"],
  ])(
    "%s deployment uses its own VITE_SUPABASE_URL/PUBLISHABLE_KEY as given",
    async (site, url, key) => {
      vi.stubEnv("VITE_SITE", site);
      vi.stubEnv("VITE_SUPABASE_URL", url);
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);

      const [calledUrl, calledKey] = await loadClientWithCapturedArgs();

      expect(calledUrl).toBe(url);
      expect(calledKey).toBe(key);
    },
  );

  it("fails loudly (no fallback project) when VITE_SUPABASE_URL is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();

    await expect(import("./supabase")).rejects.toThrow(
      /supabaseUrl is required/,
    );
  });
});
