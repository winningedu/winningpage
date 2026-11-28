import { describe, expect, test } from "vitest";
import { mapBounded } from "./mapBounded.js";

describe("mapBounded", () => {
  test("한도만큼 함께 시작하고 결과는 입력 순서로 돌려준다", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapBounded([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return n * 10;
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  test("한도 안의 항목은 모두 함께 시작한다", async () => {
    const started: number[] = [];
    const run = mapBounded([1, 2, 3], 10, async (n) => {
      started.push(n);
      await new Promise((resolve) => setTimeout(resolve, 1));
    });

    expect(started).toEqual([1, 2, 3]);
    await run;
  });

  test("입력 순서에서 앞선 항목의 오류를 던진다", async () => {
    await expect(
      mapBounded([1, 2, 3], 3, async (n) => {
        if (n === 2) throw new Error("둘");
        if (n === 3) throw new Error("셋");
        return n;
      }),
    ).rejects.toThrow("둘");
  });

  test("빈 입력은 빈 결과다", async () => {
    await expect(mapBounded([], 3, async (n) => n)).resolves.toEqual([]);
  });
});
