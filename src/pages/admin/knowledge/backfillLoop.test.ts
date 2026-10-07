import { describe, expect, it, vi } from "vitest";

import { runBackfillUntilDone } from "./backfillLoop";

describe("runBackfillUntilDone", () => {
  it("embedded 가 0 인 응답이 올 때까지 반복하고 누적 진행률을 알린다", async () => {
    const responses = [
      { embedded: 30, failed: 0 },
      { embedded: 12, failed: 1 },
      { embedded: 0, failed: 1 },
    ];
    const callBackfill = vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("더 부르면 안 된다");
      return next;
    });
    const onProgress = vi.fn();

    const result = await runBackfillUntilDone(callBackfill, onProgress);

    expect(callBackfill).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, { embedded: 30, rounds: 1 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { embedded: 42, rounds: 2 });
    expect(result).toEqual({ embedded: 42, rounds: 3, lastFailed: 1 });
  });
});
