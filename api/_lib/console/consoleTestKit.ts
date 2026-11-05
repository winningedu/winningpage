// 콘솔 라우트 테스트용 가짜 service_role 클라이언트. 테스트 파일에서만 import 한다.
// 라우트가 부르는 rpc, 테이블 조회, 감사 로그 insert, Auth Admin 호출을 한 곳에서 흉내 내고
// 호출 순서(events)를 남겨 "DB 커밋 뒤에 Auth" 같은 순서 계약을 검증하게 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { vi } from "vitest";

type Result = { data?: unknown; error?: unknown };

export interface KitState {
  user: { id: string; email: string } | null;
  actor: {
    kind: string;
    tenant_id: string | null;
    teacher_id: string | null;
    class_ids: string[];
    proxy_session_id: string | null;
    must_change_password: boolean | null;
  };
  rpc: Record<string, (args: Record<string, unknown>) => Result>;
  /** select().eq()/in()/maybeSingle() 가 돌려줄 값. 필터는 컬럼별 값(배열 가능). */
  rows: Record<string, (filters: Record<string, unknown>) => unknown>;
  inserts: { table: string; row: Record<string, unknown> }[];
  /** upsert() 로 쓴 행과 충돌 열. 에러는 insertErrors 를 따른다. */
  upserts: {
    table: string;
    row: Record<string, unknown>;
    onConflict: string | undefined;
  }[];
  insertError: unknown;
  /** 테이블별 insert 에러. 있으면 insertError 보다 먼저 쓴다. */
  insertErrors: Record<string, unknown>;
  updates: {
    table: string;
    values: Record<string, unknown>;
    filters: Record<string, unknown>;
  }[];
  /** delete() 를 건 테이블과 필터. */
  deletes: { table: string; filters: Record<string, unknown> }[];
  /** order() 로 정렬한 열. id 열이 없는 테이블을 id 로 정렬하는 실수를 테스트가 잡는 데 쓴다. */
  orders: { table: string; column: string }[];
  /** from() 마다 한 건. order(열, { ascending }) 와 limit(n) 을 건 경우 값이 채워진다. */
  reads: {
    table: string;
    orderBy?: { column: string; ascending: boolean };
    limit?: number;
  }[];
  /** 호출 순서. "rpc:이름", "auth:동작", "insert:테이블". */
  events: string[];
  auth: {
    createUser: ReturnType<typeof vi.fn>;
    listUsers: ReturnType<typeof vi.fn>;
    getUserById: ReturnType<typeof vi.fn>;
    updateUserById: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
}

/**
 * 읽기 라우트 테스트용. 라우트가 건 eq, in 필터를 메모리 행에 그대로 적용한다
 * (eq 는 문자열 비교, in 은 포함 여부). kit.rows.테이블 = (f) => matchRows(ROWS, f) 로 쓴다.
 */
export function matchRows<R extends Record<string, unknown>>(
  rows: R[],
  filters: Record<string, unknown>,
): R[] {
  return rows.filter((row) =>
    Object.entries(filters).every(([col, want]) => {
      // gte(col, v) 는 "col>=" 키로 담긴다. 날짜 문자열은 사전순 비교로 충분하다.
      if (col.endsWith(">="))
        return String(row[col.slice(0, -2)]) >= String(want);
      return Array.isArray(want)
        ? want.includes(row[col])
        : String(row[col]) === String(want);
    }),
  );
}

export function schoolAdminActor(
  over: Partial<KitState["actor"]> = {},
): KitState["actor"] {
  return {
    kind: "school_admin",
    tenant_id: "tenant-1",
    teacher_id: "admin-teacher-1",
    class_ids: [],
    proxy_session_id: null,
    must_change_password: false,
    ...over,
  };
}

export function createKitState(): KitState {
  const events: string[] = [];
  const ok = (name: string) =>
    vi.fn(async () => {
      events.push(`auth:${name}`);
      return { data: { user: { id: "auth-user-1" } }, error: null };
    });
  return {
    user: { id: "profile-1", email: "admin@example.com" },
    actor: schoolAdminActor(),
    rpc: {},
    rows: {},
    inserts: [],
    upserts: [],
    insertError: null,
    insertErrors: {},
    updates: [],
    deletes: [],
    orders: [],
    reads: [],
    events,
    auth: {
      createUser: ok("createUser"),
      listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      getUserById: vi.fn(async () => ({ data: { user: null }, error: null })),
      updateUserById: ok("updateUserById"),
      deleteUser: ok("deleteUser"),
    },
  };
}

export function createFakeAdmin(state: KitState) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: state.user },
        error: state.user ? null : { message: "bad" },
      }),
      admin: state.auth,
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.events.push(`rpc:${name}`);
      if (name === "fn_console_actor") {
        return Promise.resolve({ data: [state.actor], error: null });
      }
      const handler = state.rpc[name];
      if (
        !handler &&
        (name === "fn_teacher_issue_claim" ||
          name === "fn_teacher_reissue_claim")
      ) {
        return Promise.resolve({ data: "claimed", error: null });
      }
      // 교사 로그인 아이디의 인증 이메일(attemptLogin 이 부른다).
      if (!handler && name === "fn_login_resolve_email") {
        return Promise.resolve({
          data: `${String(args.p_username).toLowerCase()}@teacher.schoolmentor.kr`,
          error: null,
        });
      }
      return Promise.resolve(
        handler ? handler(args) : { data: null, error: null },
      );
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      const read: KitState["reads"][number] = { table };
      state.reads.push(read);
      const result = () => {
        const data = state.rows[table]?.(filters) ?? null;
        // limit 을 건 읽기만 정렬과 자르기를 흉내 낸다(그 밖의 읽기는 픽스처 순서 그대로).
        if (!Array.isArray(data) || read.limit === undefined) {
          return { data, error: null };
        }
        const column = read.orderBy?.column;
        const sign = read.orderBy?.ascending === false ? -1 : 1;
        const sorted = column
          ? [...data].sort(
              (a, b) =>
                sign *
                String((a as Record<string, unknown>)[column]).localeCompare(
                  String((b as Record<string, unknown>)[column]),
                ),
            )
          : data;
        return { data: sorted.slice(0, read.limit), error: null };
      };
      chain.select = () => chain;
      chain.eq = (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      };
      chain.in = (col: string, values: unknown[]) => {
        filters[col] = values;
        return chain;
      };
      chain.gte = (col: string, value: unknown) => {
        filters[`${col}>=`] = value;
        return chain;
      };
      for (const m of ["like", "ilike", "range"]) chain[m] = () => chain;
      chain.limit = (count: number) => {
        read.limit = count;
        return chain;
      };
      chain.order = (column: string, options?: { ascending?: boolean }) => {
        state.orders.push({ table, column });
        read.orderBy = { column, ascending: options?.ascending ?? true };
        return chain;
      };
      chain.maybeSingle = async () => result();
      // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
      chain.then = (resolve: (r: unknown) => unknown) => resolve(result());
      chain.update = (values: Record<string, unknown>) => {
        state.events.push(`update:${table}`);
        state.updates.push({ table, values, filters });
        return chain;
      };
      chain.delete = () => {
        state.events.push(`delete:${table}`);
        state.deletes.push({ table, filters });
        return chain;
      };
      chain.upsert = (
        row: Record<string, unknown>,
        options?: { onConflict?: string },
      ) => {
        state.events.push(`upsert:${table}`);
        state.upserts.push({ table, row, onConflict: options?.onConflict });
        return Promise.resolve({ error: state.insertErrors[table] ?? null });
      };
      chain.insert = (row: Record<string, unknown>) => {
        state.events.push(`insert:${table}`);
        state.inserts.push({ table, row });
        return Promise.resolve({
          error: state.insertErrors[table] ?? state.insertError,
        });
      };
      return chain;
    },
  };
}

export interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** defineHandler 가 돌려준 핸들러를 Bearer 토큰 요청으로 한 번 부르고 응답을 모은다. */
export async function callHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  body: unknown,
  method = "POST",
  query: Record<string, string> = {},
): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined, headers: {} };
  const res = {
    setHeader: (key: string, value: string) => {
      captured.headers[key] = value;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method,
      headers: { authorization: "Bearer token" },
      query,
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}
