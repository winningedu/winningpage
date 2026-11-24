import { describe, expect, test } from "vitest";
import { chunkItemsBySize } from "./chunkItems";

const bodyBytes = (items: unknown[]) =>
  new TextEncoder().encode(JSON.stringify({ items })).length;
const row = (key: string, size: number) => ({ key, text: "x".repeat(size) });

describe("chunkItemsBySize", () => {
  test("빈 입력이면 청크가 없다", () => {
    expect(chunkItemsBySize([], 1000)).toEqual([]);
  });

  test("한도 안에 들어가면 한 청크로 묶는다", () => {
    const items = [row("a", 10), row("b", 10)];
    expect(chunkItemsBySize(items, 1000)).toEqual([items]);
  });

  test("순서를 지키고 모든 청크의 본문 크기가 한도 이하다", () => {
    const items = Array.from({ length: 20 }, (_, i) => row(`k${i}`, 100 + i));
    const limit = 600;
    const chunks = chunkItemsBySize(items, limit);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(items);
    for (const chunk of chunks) {
      expect(bodyBytes(chunk)).toBeLessThanOrEqual(limit);
    }
  });

  test("한도를 넘는 한 행은 버리지 않고 혼자 한 청크가 된다", () => {
    const items = [row("a", 10), row("big", 5000), row("b", 10), row("c", 10)];
    const chunks = chunkItemsBySize(items, 1000);
    expect(chunks).toEqual([[items[0]], [items[1]], [items[2], items[3]]]);
  });

  test("한글은 UTF-8 바이트로 센다", () => {
    const items = [row("a", 0), row("b", 0)].map((r) => ({
      ...r,
      text: "가".repeat(100),
    }));
    const limit = bodyBytes([items[0]]) + 5;
    expect(chunkItemsBySize(items, limit)).toEqual([[items[0]], [items[1]]]);
  });
});
