import { describe, expect, test } from "vitest";
import { startEarly } from "./startEarly.js";

describe("startEarly", () => {
  test("같은 프라미스를 돌려주고, 나중에 await 하면 그때 값이나 오류가 나온다", async () => {
    await expect(startEarly(Promise.resolve(1))).resolves.toBe(1);
    await expect(startEarly(Promise.reject(new Error("앞")))).rejects.toThrow(
      "앞",
    );
  });

  test("then 을 부를 때 시작하는 값도 바로 시작한다", async () => {
    let started = false;
    const lazy = {
      // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더처럼 then 을 부를 때 시작하는 값이다.
      then: (resolve: (value: number) => unknown) => {
        started = true;
        return resolve(1);
      },
    } as unknown as PromiseLike<number>;

    const read = startEarly(lazy);
    await Promise.resolve();

    expect(started).toBe(true);
    await expect(read).resolves.toBe(1);
  });

  test("끝내 await 하지 않은 거부가 처리되지 않은 거부로 남지 않는다", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      startEarly(Promise.reject(new Error("버려진 읽기")));
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", listener);
    }
    expect(unhandled).toEqual([]);
  });
});
