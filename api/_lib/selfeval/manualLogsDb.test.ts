import { describe, expect, test, vi } from "vitest";
import { claimUploadAttempt } from "./manualLogsDb.js";

const rpc = (data: unknown) => vi.fn(async () => ({ data, error: null }));

describe("claimUploadAttempt", () => {
  test("claims through the database function with the cap and returns true while under it", async () => {
    const fn = rpc({ kind: "claimed", count: 3 });
    const ok = await claimUploadAttempt({ rpc: fn } as never, "u1", "s1", 10);
    expect(ok).toBe(true);
    expect(fn).toHaveBeenCalledWith("fn_selfeval_claim_upload", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_cap: 10,
    });
  });

  test("returns false once the database says the cap is used", async () => {
    const ok = await claimUploadAttempt(
      { rpc: rpc({ kind: "limit", count: 10 }) } as never,
      "u1",
      "s1",
      10,
    );
    expect(ok).toBe(false);
  });

  test("throws for a locked or unknown result so the upload does not go through", async () => {
    await expect(
      claimUploadAttempt(
        { rpc: rpc({ kind: "locked" }) } as never,
        "u1",
        "s1",
        10,
      ),
    ).rejects.toThrow();
  });
});
