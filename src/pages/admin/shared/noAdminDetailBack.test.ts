import { describe, expect, it } from "vitest";

// 삭제된 훅이 다시 생기지 않게 src 전체 원문을 훑는다.
const NAME = "useAdmin" + "DetailBack";
const files = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("useAdminDetailBack 제거", () => {
  it("src 어디에도 남아 있지 않다", () => {
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThan(100);
    const hits = paths.filter((p) => files[p]?.includes(NAME));
    expect(hits).toEqual([]);
  });
});
