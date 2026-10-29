// fetchLatestAdviceCache — 오늘 행 우선, 없으면 가장 최근 행, 없으면 null(QA 행70).
// supabase 쿼리 빌더 대신 같은 체인(eq/lte/order/limit/maybeSingle)을 구현한 인메모리 가짜를 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { fetchLatestAdviceCache } from "./repo.js";

type CacheRow = {
  profile_id: string;
  source: string;
  generated_for: string;
  payload: string;
};

function fakeSupabase(rows: CacheRow[]) {
  return {
    from() {
      let result = rows;
      const builder = {
        select: () => builder,
        eq(column: keyof CacheRow, value: string) {
          result = result.filter((row) => row[column] === value);
          return builder;
        },
        lte(column: keyof CacheRow, value: string) {
          result = result.filter((row) => row[column] <= value);
          return builder;
        },
        order(column: keyof CacheRow, opts: { ascending: boolean }) {
          result = [...result].sort((a, b) =>
            opts.ascending
              ? a[column].localeCompare(b[column])
              : b[column].localeCompare(a[column]),
          );
          return builder;
        },
        limit(count: number) {
          result = result.slice(0, count);
          return builder;
        },
        maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const row = (generated_for: string, payload: string): CacheRow => ({
  profile_id: "p1",
  source: "daily",
  generated_for,
  payload,
});

describe("fetchLatestAdviceCache", () => {
  test("오늘 행이 있으면 더 오래된 행이 있어도 오늘 행을 돌려준다", async () => {
    const supabase = fakeSupabase([
      row("2026-10-27", "old"),
      row("2026-10-29", "today"),
    ]);
    const found = await fetchLatestAdviceCache(
      supabase,
      "p1",
      "daily",
      "2026-10-29",
    );
    expect(found?.payload).toBe("today");
  });

  test("오늘 행이 없으면 가장 최근 generated_for 행을 돌려준다", async () => {
    const supabase = fakeSupabase([
      row("2026-10-20", "older"),
      row("2026-10-28", "latest"),
    ]);
    const found = await fetchLatestAdviceCache(
      supabase,
      "p1",
      "daily",
      "2026-10-29",
    );
    expect(found?.payload).toBe("latest");
  });

  test("행이 하나도 없으면 null이다", async () => {
    const found = await fetchLatestAdviceCache(
      fakeSupabase([]),
      "p1",
      "daily",
      "2026-10-29",
    );
    expect(found).toBeNull();
  });
});
