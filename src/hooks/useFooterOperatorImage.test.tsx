import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useFooterOperatorImage } from "./useFooterOperatorImage";

type Row = {
  id: number;
  title: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
};

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  error: null as unknown,
  // 훅이 실제로 보낸 쿼리 호출 기록.
  fromTables: [] as string[],
  eqCalls: [] as [string, unknown][],
  orderColumns: [] as string[],
}));

// eq, order 를 메모리 행에 적용하고 limit 에서 결과를 내는 최소 쿼리 빌더.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      db.fromTables.push(table);
      let rows = [...db.rows];
      const orderKeys: (keyof Row)[] = [];
      const builder = {
        select: () => builder,
        eq: (column: keyof Row, value: unknown) => {
          db.eqCalls.push([column, value]);
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        order: (column: keyof Row) => {
          db.orderColumns.push(column);
          orderKeys.push(column);
          return builder;
        },
        limit: (count: number) => {
          const sorted = [...rows].sort((a, b) => {
            for (const key of orderKeys) {
              const diff = Number(a[key]) - Number(b[key]);
              if (diff !== 0) return diff;
            }
            return 0;
          });
          return Promise.resolve({
            data: db.error ? null : sorted.slice(0, count),
            error: db.error,
          });
        },
      };
      return builder;
    },
  },
}));

afterEach(() => {
  db.rows = [];
  db.error = null;
  db.fromTables = [];
  db.eqCalls = [];
  db.orderColumns = [];
});

describe("useFooterOperatorImage", () => {
  test("노출 중인 행 가운데 순서가 가장 앞선 행의 주소와 제목을 돌려준다", async () => {
    db.rows = [
      {
        id: 1,
        title: "숨김",
        image_url: "/hidden.png",
        sort_order: 0,
        is_active: false,
      },
      {
        id: 2,
        title: "뒤",
        image_url: "/b.png",
        sort_order: 5,
        is_active: true,
      },
      {
        id: 3,
        title: "앞",
        image_url: "/a.png",
        sort_order: 1,
        is_active: true,
      },
    ];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({ imageUrl: "/a.png", title: "앞" });
    // 결과가 맞아 보이는 것만으로는 부족하다. 실제로 한 번만, 노출 필터와 두 정렬을 붙여 조회했는지 본다.
    expect(db.fromTables).toEqual(["footer_operator_images"]);
    expect(db.eqCalls).toEqual([["is_active", true]]);
    expect(db.orderColumns).toEqual(["sort_order", "id"]);
  });

  test("순서가 같으면 id 가 작은 행을 고른다", async () => {
    db.rows = [
      {
        id: 9,
        title: "나중",
        image_url: "/9.png",
        sort_order: 1,
        is_active: true,
      },
      {
        id: 4,
        title: "먼저",
        image_url: "/4.png",
        sort_order: 1,
        is_active: true,
      },
    ];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.title).toBe("먼저");
  });

  test("행이 없으면 null 이다", async () => {
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(db.fromTables).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
  });

  test("조회 오류면 null 이다", async () => {
    db.error = { message: "boom" };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });
});
