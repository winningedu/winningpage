import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterResponse } from "./afterResponse.js";

const CONTEXT_SYMBOL = Symbol.for("@vercel/request-context");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT_SYMBOL];
});

describe("scheduleAfterResponse", () => {
  it("Vercel 요청 컨텍스트가 있으면 작업 promise 를 waitUntil 에 넘긴다", async () => {
    const waitUntil = vi.fn();
    (globalThis as Record<symbol, unknown>)[CONTEXT_SYMBOL] = {
      get: () => ({ waitUntil }),
    };
    const work = vi.fn(async () => "ok");

    scheduleAfterResponse(work);

    expect(work).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });

  it("요청 컨텍스트가 없어도 throw 하지 않고 작업을 실행한다", async () => {
    let done = false;
    const work = vi.fn(async () => {
      done = true;
    });

    expect(() => scheduleAfterResponse(work)).not.toThrow();
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    expect(done).toBe(true);
  });

  it("작업이 거부되거나 동기로 throw 해도 waitUntil 에 넘긴 promise 는 거부되지 않는다", async () => {
    const waitUntil = vi.fn();
    (globalThis as Record<symbol, unknown>)[CONTEXT_SYMBOL] = {
      get: () => ({ waitUntil }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    scheduleAfterResponse(async () => {
      throw new Error("비동기 실패");
    });
    expect(() =>
      scheduleAfterResponse(() => {
        throw new Error("동기 실패");
      }),
    ).not.toThrow();

    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
    await expect(waitUntil.mock.calls[1]?.[0]).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
