// 어드민 라우트 테스트용 가짜. consoleTestKit 은 필터를 한 키에 한 값만 담고 count, insert().select().single(), or 를 모르고,
// fakeSupabase.testkit 은 행 기반이라 range, 정렬 인자 단언이 어렵다. 여기는 호출한 메서드와 인자를 그대로 기록하고
// 테이블별 응답 함수가 그 기록을 보고 결과를 정한다(인자 단언용). 필요한 만큼만 둔다.

import type { VercelRequest, VercelResponse } from "@vercel/node";

export type Result = { data?: unknown; error?: unknown; count?: number | null };
export type Call = { method: string; args: unknown[] };
export type Query = { table: string; calls: Call[] };
export type Respond = (query: Query) => Result;

const EMPTY: Result = { data: null, error: null };

/** 쿼리에 건 같은 이름의 호출 전부. */
export function callsOf(query: Query, method: string): Call[] {
  return query.calls.filter((call) => call.method === method);
}

/** 쿼리에 건 첫 호출의 인자. 없으면 undefined. */
export function argsOf(query: Query, method: string): unknown[] | undefined {
  return callsOf(query, method)[0]?.args;
}

export function createRecorder(
  tables: Record<string, Respond> = {},
  rpcs: Record<string, (args: Record<string, unknown>) => Result> = {},
) {
  const queries: Query[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  function from(table: string) {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const result = () => tables[table]?.(query) ?? EMPTY;
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: Result) => unknown) => resolve(result());
          }
          return (...args: unknown[]) => {
            query.calls.push({ method: String(prop), args });
            // single, maybeSingle 은 끝에서 한 행으로 받는다.
            if (prop === "single" || prop === "maybeSingle") {
              return Promise.resolve(result());
            }
            return chain;
          };
        },
      },
    );
    return chain;
  }

  function rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcs[name]?.(args) ?? EMPTY);
  }

  return { from, rpc, queries, rpcCalls };
}

/** 테이블의 첫 쿼리. 없으면 테스트가 잘못된 것이라 던진다. */
export function firstQuery(
  recorder: { queries: Query[] },
  table: string,
): Query {
  const query = recorder.queries.find((item) => item.table === table);
  if (!query) throw new Error(`${table} 쿼리가 없습니다.`);
  return query;
}

/** 같은 테이블을 여러 번 읽는 쿼리를 모은다. */
export function queriesOn(
  recorder: { queries: Query[] },
  table: string,
): Query[] {
  return recorder.queries.filter((query) => query.table === table);
}

export interface AdminFakeOptions {
  /** fn_admin_effective_permissions 가 돌려줄 행. */
  permissions: { resource_key: string; level: string }[];
  tables?: Record<string, Respond>;
  rpcs?: Record<string, (args: Record<string, unknown>) => Result>;
}

/** defineHandler(auth:"admin") 를 통과하는 service_role 가짜. 관리자 판정과 권한 rpc 는 여기서 처리한다. */
export function createAdminFake(options: AdminFakeOptions) {
  // 관리자 판정(select("role"))만 가로채고 나머지 profiles 읽기는 테스트가 정한 응답으로 보낸다.
  const profiles: Respond = (query) =>
    argsOf(query, "select")?.[0] === "role"
      ? { data: { role: "admin" }, error: null }
      : (options.tables?.profiles?.(query) ?? EMPTY);
  const recorder = createRecorder(
    { ...options.tables, profiles },
    options.rpcs,
  );
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-1" } },
        error: null,
      }),
    },
    from: recorder.from,
    rpc: (name: string, args: Record<string, unknown>) =>
      name === "fn_admin_effective_permissions"
        ? Promise.resolve({ data: options.permissions, error: null })
        : recorder.rpc(name, args),
    queries: recorder.queries,
    rpcCalls: recorder.rpcCalls,
  };
}

export interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** defineHandler 가 돌려준 핸들러를 Bearer 토큰 요청으로 한 번 부른다. problem 바디(end)와 json 바디를 모두 받는다. */
export async function callRoute(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  request: {
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
  } = {},
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
    end(payload: string) {
      captured.body = JSON.parse(payload);
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: request.method ?? "GET",
      headers: { authorization: "Bearer admin-token" },
      query: request.query ?? {},
      body: request.body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

export function problemCode(body: unknown): string | undefined {
  return (body as { code?: string }).code;
}
