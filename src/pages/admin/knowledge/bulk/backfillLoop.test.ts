import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "../apiResult";
import { type BackfillRound, runBackfillUntilDone } from "./backfillLoop";

function scripted(responses: ApiResult<BackfillRound>[]) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("더 부르면 안 된다");
    return next;
  });
}

describe("runBackfillUntilDone", () => {
  it("embedded 가 0 인 응답이 올 때까지 반복하고 누적 진행률을 알린다", async () => {
    const callBackfill = scripted([
      { ok: true, data: { embedded: 30, failed: 0 } },
      { ok: true, data: { embedded: 12, failed: 1 } },
      { ok: true, data: { embedded: 0, failed: 1 } },
    ]);
    const onProgress = vi.fn();

    const result = await runBackfillUntilDone(callBackfill, onProgress);

    expect(callBackfill).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, { embedded: 30, rounds: 1 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { embedded: 42, rounds: 2 });
    expect(result).toEqual({
      ok: true,
      data: { embedded: 42, rounds: 3, lastFailed: 1 },
    });
  });

  it("호출이 ok:false 를 돌려주면 던지지 않고 그 회차에서 멈춰 메시지를 ok:false 로 돌려준다", async () => {
    const callBackfill = scripted([
      { ok: true, data: { embedded: 30, failed: 0 } },
      { ok: false, message: "임베딩 키가 없습니다." },
    ]);
    const onProgress = vi.fn();

    const result = await runBackfillUntilDone(callBackfill, onProgress);

    expect(callBackfill).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, message: "임베딩 키가 없습니다." });
  });
});
