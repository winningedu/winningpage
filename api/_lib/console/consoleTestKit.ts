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
  insertError: unknown;
  /** 호출 순서. "rpc:이름", "auth:동작", "insert:테이블". */
  events: string[];
  auth: {
    createUser: ReturnType<typeof vi.fn>;
    listUsers: ReturnType<typeof vi.fn>;
    updateUserById: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
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
    insertError: null,
    events,
    auth: {
      createUser: ok("createUser"),
      listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
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
      return Promise.resolve(
        handler ? handler(args) : { data: null, error: null },
      );
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      const result = () => ({
        data: state.rows[table]?.(filters) ?? null,
        error: null,
      });
      chain.select = () => chain;
      chain.eq = (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      };
      chain.in = (col: string, values: unknown[]) => {
        filters[col] = values;
        return chain;
      };
      chain.maybeSingle = async () => result();
      // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
      chain.then = (resolve: (r: unknown) => unknown) => resolve(result());
      chain.insert = (row: Record<string, unknown>) => {
        state.events.push(`insert:${table}`);
        state.inserts.push({ table, row });
        return Promise.resolve({ error: state.insertError });
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
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}
