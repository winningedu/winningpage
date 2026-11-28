import { describe, expect, test } from "vitest";
import { GOAL_CUTS_READ_CHUNK, readChunks } from "./cuts.js";

describe("readChunks", () => {
  test("쪽 시작 위치를 한꺼번에 시작하고 행은 시작 위치 순서로 돌려준다", async () => {
    const total = GOAL_CUTS_READ_CHUNK * 3 + 5;
    const started: number[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = readChunks(total, async (from) => {
      started.push(from);
      await gate;
      return [from];
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([
      0,
      GOAL_CUTS_READ_CHUNK,
      GOAL_CUTS_READ_CHUNK * 2,
      GOAL_CUTS_READ_CHUNK * 3,
    ]);
    release();

    expect(await run).toEqual(started);
  });

  test("진행 수는 읽은 행 수만큼 늘어 마지막에 전체가 된다", async () => {
    const seen: number[] = [];

    await readChunks(
      GOAL_CUTS_READ_CHUNK * 2,
      async () => new Array(GOAL_CUTS_READ_CHUNK).fill(0),
      (done) => seen.push(done),
    );

    expect(seen.at(-1)).toBe(GOAL_CUTS_READ_CHUNK * 2);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  test("읽기가 실패하면 그 오류를 던진다", async () => {
    await expect(
      readChunks(GOAL_CUTS_READ_CHUNK * 2, async (from) => {
        if (from > 0) throw new Error("goal read failed");
        return [];
      }),
    ).rejects.toThrow("goal read failed");
  });

  test("행이 없으면 읽지 않는다", async () => {
    let calls = 0;

    const rows = await readChunks(0, async () => {
      calls += 1;
      return [];
    });

    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });
});
