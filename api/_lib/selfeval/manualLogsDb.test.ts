import { describe, expect, test, vi } from "vitest";
import { claimUploadAttempt, SessionNotOpenError } from "./manualLogsDb.js";

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

  test("throws SessionNotOpenError for a locked result so the route can answer 409", async () => {
    await expect(
      claimUploadAttempt(
        { rpc: rpc({ kind: "locked" }) } as never,
        "u1",
        "s1",
        10,
      ),
    ).rejects.toBeInstanceOf(SessionNotOpenError);
  });

  test("throws a plain error for an unknown result so the upload does not go through", async () => {
    const err = await claimUploadAttempt(
      { rpc: rpc({ kind: "weird" }) } as never,
      "u1",
      "s1",
      10,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SessionNotOpenError);
  });
});
