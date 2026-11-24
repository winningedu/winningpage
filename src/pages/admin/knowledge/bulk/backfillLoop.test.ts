import { describe, expect, it, vi } from "vitest";

import { type BackfillRound, runBackfillUntilDone } from "./backfillLoop";

function scripted(responses: (BackfillRound | Error)[]) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("더 부르면 안 된다");
    if (next instanceof Error) throw next;
    return next;
  });
}

describe("runBackfillUntilDone", () => {
  it("embedded 가 0 인 응답이 올 때까지 반복하고 누적 진행률을 알린다", async () => {
    const callBackfill = scripted([
      { embedded: 30, failed: 0 },
      { embedded: 12, failed: 1 },
      { embedded: 0, failed: 1 },
    ]);
    const onProgress = vi.fn();

    const result = await runBackfillUntilDone(callBackfill, onProgress);

    expect(callBackfill).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, { embedded: 30, rounds: 1 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { embedded: 42, rounds: 2 });
    expect(result).toEqual({ embedded: 42, rounds: 3, lastFailed: 1 });
  });

  it("호출이 실패하면 그 회차에서 멈추고 그 예외를 그대로 던진다", async () => {
    const callBackfill = scripted([
      { embedded: 30, failed: 0 },
      new Error("임베딩 키가 없습니다."),
    ]);
    const onProgress = vi.fn();

    await expect(
      runBackfillUntilDone(callBackfill, onProgress),
    ).rejects.toThrow("임베딩 키가 없습니다.");

    expect(callBackfill).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
