// 핸들러 테스트용 메모리 Supabase 가짜. 실제 쿼리 빌더처럼 필터를 적용해서,
// 테스트가 "어떤 필터를 걸었는지"가 아니라 "그 결과 어떤 행이 보이는지"로
// 동작을 검증하게 한다. 필요한 만큼만 지원한다(select, eq, is, not, or, order,
// limit, maybeSingle, update, rpc, auth.admin.updateUserById, tenants(name) 임베드).

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeDb = {
  tables: Record<string, Row[]>;
  rpcs: Record<string, (args: Record<string, unknown>) => unknown>;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  passwordUpdates: { id: string; password: string }[];
};

export function createFakeDb(init: Partial<FakeDb> = {}): FakeDb {
  return {
    tables: init.tables ?? {},
    rpcs: init.rpcs ?? {},
    rpcCalls: [],
    passwordUpdates: [],
  };
}

function matchOr(expr: string): Filter {
  const conds = expr.split(",").map((part) => {
    const [col, op, ...rest] = part.split(".");
    return { col: col!, op, value: rest.join(".") };
  });
  return (row) =>
    conds.some((c) => c.op === "eq" && String(row[c.col] ?? "") === c.value);
}

class Query {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private single = false;
  private patch: Row | null = null;
  private embedTenant = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(cols = "*") {
    this.embedTenant = /tenants\(/.test(cols);
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  not(col: string, op: string, value: unknown) {
    if (op === "is")
      this.filters.push((r) => (r[col] ?? null) !== (value ?? null));
    return this;
  }
  or(expr: string) {
    this.filters.push(matchOr(expr));
    return this;
  }
  order(col: string, opts: { ascending: boolean }) {
    this.orderBy = { col, asc: opts.ascending };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  returns() {
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    const all = this.db.tables[this.table] ?? [];
    let rows = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) {
      for (const r of rows) Object.assign(r, this.patch);
      return { data: null, error: null };
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) =>
        String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : asc ? 1 : -1,
      );
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    if (this.embedTenant) {
      const tenants = this.db.tables.tenants ?? [];
      rows = rows.map((r) => ({
        ...r,
        tenants: tenants.find((t) => t.id === r.tenant_id) ?? null,
      }));
    }
    return { data: this.single ? (rows[0] ?? null) : rows, error: null };
  }

  // await 로 결과를 받는 supabase-js 빌더 흉내(thenable).
  // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    onfulfilled?:
      | ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ) {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(db: FakeDb) {
  return {
    from: (table: string) => new Query(db, table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ name, args });
      try {
        return { data: db.rpcs[name]?.(args) ?? null, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: { password: string }) => {
          db.passwordUpdates.push({ id, password: attrs.password });
          return { error: null };
        },
      },
    },
  };
}

export type FakeResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

/** defineHandler 가 만든 핸들러를 가짜 req/res 로 호출하고 응답을 돌려준다. */
export async function callHandler(
  handler: (req: never, res: never) => unknown,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<FakeResponse> {
  const captured: FakeResponse = { status: 0, body: undefined, headers: {} };
  const res = {
    setHeader: (k: string, v: string) => {
      captured.headers[k] = v;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };
  const req = { method: "POST", body, headers, socket: {} };
  await handler(req as never, res as never);
  return captured;
}
