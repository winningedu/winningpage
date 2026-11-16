import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  selectFooterOperatorImage,
  useFooterOperatorImage,
} from "./useFooterOperatorImage";

type Row = {
  id: number;
  title: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  tenant_id: string | null;
};

type RpcResult = { data: string[] | null; error: { message: string } | null };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  error: null as unknown,
  // 훅이 실제로 보낸 쿼리 호출 기록.
  fromTables: [] as string[],
  eqCalls: [] as [string, unknown][],
  orderColumns: [] as string[],
  rpcCalls: [] as string[],
  // 소속 기관 조회 결과. 사용자 id 별로 다르게 돌려준다.
  tenantIdsByUser: {} as Record<string, string[]>,
  rpcError: null as { message: string } | null,
  // 설정하면 rpc 가 이 약속이 풀릴 때까지 끝나지 않는다.
  rpcGate: null as Promise<void> | null,
}));

const auth = vi.hoisted(() => ({
  value: { user: null, isReady: true } as {
    user: { id: string } | null;
    isReady: boolean;
  },
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => auth.value,
}));

// eq, order 를 메모리 행에 적용하고, 마지막 order 뒤에 await 하면 결과를 내는 최소 쿼리 빌더.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      db.fromTables.push(table);
      let rows = [...db.rows];
      const orderKeys: (keyof Row)[] = [];
      // order 를 부를 때마다 지금까지의 정렬을 적용한 결과를 약속으로 내고, 이어서 order 를 더 붙일 수도 있다.
      const result = () => {
        const sorted = [...rows].sort((a, b) => {
          for (const key of orderKeys) {
            const diff = Number(a[key]) - Number(b[key]);
            if (diff !== 0) return diff;
          }
          return 0;
        });
        return Promise.resolve({
          data: db.error ? null : sorted,
          error: db.error,
        });
      };
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
          return Object.assign(result(), { order: builder.order });
        },
      };
      return builder;
    },
    rpc: async (name: string): Promise<RpcResult> => {
      db.rpcCalls.push(name);
      if (db.rpcGate) await db.rpcGate;
      if (db.rpcError) return { data: null, error: db.rpcError };
      const userId = auth.value.user?.id ?? "";
      return { data: db.tenantIdsByUser[userId] ?? [], error: null };
    },
  },
}));

function row(overrides: Partial<Row> & Pick<Row, "id" | "title">): Row {
  return {
    image_url: `/${overrides.id}.png`,
    sort_order: 1,
    is_active: true,
    tenant_id: null,
    ...overrides,
  };
}

afterEach(() => {
  db.rows = [];
  db.error = null;
  db.fromTables = [];
  db.eqCalls = [];
  db.orderColumns = [];
  db.rpcCalls = [];
  db.tenantIdsByUser = {};
  db.rpcError = null;
  db.rpcGate = null;
  auth.value = { user: null, isReady: true };
});

describe("useFooterOperatorImage", () => {
  test("노출 중인 행 가운데 순서가 가장 앞선 행의 주소와 제목을 돌려준다", async () => {
    db.rows = [
      row({ id: 1, title: "숨김", sort_order: 0, is_active: false }),
      row({ id: 2, title: "뒤", sort_order: 5 }),
      row({ id: 3, title: "앞", sort_order: 1 }),
    ];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({ imageUrl: "/3.png", title: "앞" });
    // 결과가 맞아 보이는 것만으로는 부족하다. 실제로 한 번만, 노출 필터와 두 정렬을 붙여 조회했는지 본다.
    expect(db.fromTables).toEqual(["footer_operator_images"]);
    expect(db.eqCalls).toEqual([["is_active", true]]);
    expect(db.orderColumns).toEqual(["sort_order", "id"]);
  });

  test("순서가 같으면 id 가 작은 행을 고른다", async () => {
    db.rows = [row({ id: 9, title: "나중" }), row({ id: 4, title: "먼저" })];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.title).toBe("먼저");
  });

  test("비회원은 대상이 없는 공통 이미지를 보고 소속 기관 조회는 하지 않는다", async () => {
    db.rows = [
      row({ id: 1, title: "A기관", sort_order: 1, tenant_id: "tenant-a" }),
      row({ id: 2, title: "공통", sort_order: 9 }),
    ];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.title).toBe("공통");
    expect(db.rpcCalls).toEqual([]);
  });

  test("회원은 소속 기관 이미지를 본다", async () => {
    auth.value = { user: { id: "u1" }, isReady: true };
    db.tenantIdsByUser = { u1: ["tenant-a"] };
    db.rows = [
      row({ id: 1, title: "공통", sort_order: 1 }),
      row({ id: 2, title: "A기관", sort_order: 9, tenant_id: "tenant-a" }),
      row({ id: 3, title: "B기관", sort_order: 0, tenant_id: "tenant-b" }),
    ];
    const { result } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.title).toBe("A기관");
    expect(db.rpcCalls).toEqual(["fn_matched_tenant_ids"]);
  });

  test("행과 소속 기관 조회가 모두 끝나기 전에는 null 이라 공통 이미지가 먼저 번쩍이지 않는다", async () => {
    auth.value = { user: { id: "u1" }, isReady: true };
    db.tenantIdsByUser = { u1: ["tenant-a"] };
    db.rows = [
      row({ id: 1, title: "공통", sort_order: 1 }),
      row({ id: 2, title: "A기관", sort_order: 9, tenant_id: "tenant-a" }),
    ];
    let release: () => void = () => {};
    db.rpcGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => useFooterOperatorImage());
    // 행 조회는 끝났지만 소속 기관 조회가 아직이다.
    await waitFor(() => expect(db.rpcCalls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
    release();
    await waitFor(() => expect(result.current?.title).toBe("A기관"));
  });

  test("인증 상태가 확정되기 전에는 null 이고 조회 결과도 내지 않는다", async () => {
    auth.value = { user: null, isReady: false };
    db.rows = [row({ id: 1, title: "공통" })];
    const { result, rerender } = renderHook(() => useFooterOperatorImage());
    await waitFor(() => expect(db.fromTables).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
    auth.value = { user: null, isReady: true };
    rerender();
    await waitFor(() => expect(result.current?.title).toBe("공통"));
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

// 행은 DB 가 sort_order, id 순으로 정렬해 넘긴 순서 그대로 들어온다.
describe("selectFooterOperatorImage", () => {
  const common = { image_url: "/c.png", title: "공통", tenant_id: null };
  const mineA = { image_url: "/a.png", title: "A기관", tenant_id: "tenant-a" };
  const mineA2 = {
    image_url: "/a2.png",
    title: "A기관 둘째",
    tenant_id: "tenant-a",
  };
  const otherB = { image_url: "/b.png", title: "B기관", tenant_id: "tenant-b" };

  test("순서가 더 뒤여도 내 기관 이미지가 공통보다 먼저 보인다", () => {
    expect(selectFooterOperatorImage([common, mineA], ["tenant-a"])).toEqual({
      imageUrl: "/a.png",
      title: "A기관",
    });
  });

  test("내 기관 이미지가 둘이면 앞선 순서를 고른다", () => {
    expect(
      selectFooterOperatorImage([mineA, mineA2, common], ["tenant-a"]),
    ).toEqual({ imageUrl: "/a.png", title: "A기관" });
  });

  test("다른 기관 이미지는 보지 않고 공통으로 돌아간다", () => {
    expect(selectFooterOperatorImage([otherB, common], ["tenant-a"])).toEqual({
      imageUrl: "/c.png",
      title: "공통",
    });
  });

  test("공통도 내 기관 이미지도 없으면 null 이다", () => {
    expect(selectFooterOperatorImage([otherB], ["tenant-a"])).toBeNull();
  });

  test("비회원(빈 목록)은 공통 이미지를 본다", () => {
    expect(selectFooterOperatorImage([otherB, mineA, common], [])).toEqual({
      imageUrl: "/c.png",
      title: "공통",
    });
  });

  test("소속 기관이 둘이면 두 기관 이미지 중 앞선 순서를 고른다", () => {
    expect(
      selectFooterOperatorImage(
        [common, otherB, mineA],
        ["tenant-a", "tenant-b"],
      ),
    ).toEqual({ imageUrl: "/b.png", title: "B기관" });
  });
});
