import { describe, expect, test } from "vitest";
import { allInOrder } from "./allInOrder.js";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe("allInOrder", () => {
  test("모든 읽기를 한꺼번에 시작하고 값을 넘긴 순서대로 돌려준다", async () => {
    const first = deferred<number>();
    const second = deferred<string>();
    const started: string[] = [];
    const run = allInOrder(
      (() => {
        started.push("first");
        return first.promise;
      })(),
      (() => {
        started.push("second");
        return second.promise;
      })(),
    );

    expect(started).toEqual(["first", "second"]);
    second.resolve("b");
    first.resolve(1);
    await expect(run).resolves.toEqual([1, "b"]);
  });

  test("뒤 읽기가 먼저 실패해도 앞 읽기의 오류가 응답이 된다", async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    const run = allInOrder(first.promise, second.promise);

    second.reject(new Error("뒤"));
    first.reject(new Error("앞"));

    await expect(run).rejects.toThrow("앞");
  });

  test("앞 읽기가 성공이면 뒤 읽기의 오류를 던진다", async () => {
    await expect(
      allInOrder(Promise.resolve(1), Promise.reject(new Error("뒤"))),
    ).rejects.toThrow("뒤");
  });

  test("처리되지 않은 거부를 남기지 않는다", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      await expect(
        allInOrder(
          Promise.reject(new Error("앞")),
          Promise.reject(new Error("뒤")),
        ),
      ).rejects.toThrow("앞");
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", listener);
    }
    expect(unhandled).toEqual([]);
  });
});
