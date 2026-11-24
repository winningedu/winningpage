// 목표관리 학생 라우트 테스트용 메모리 DB. 테스트 파일에서만 import 한다.
// 인증과 권한(rpc)은 consoleTestKit 가짜를 쓰고, goal_* 와 profiles 읽기만 실제 행에 필터를 걸어 흉내 낸다.

import { createFakeAdmin, type KitState } from "../console/consoleTestKit.js";

type Row = Record<string, unknown>;
type Kind = "eq" | "in" | "lt";

export interface GoalCall {
  table: string;
  op: "select" | "write";
  columns?: string | undefined;
  filters: [column: string, kind: Kind, value: unknown][];
  or?: string;
  orders: [
    column: string,
    ascending: boolean,
    nullsFirst?: boolean | undefined,
  ][];
  range?: [from: number, to: number];
  limit?: number;
  count: boolean;
}

export interface GoalDb {
  tables: Record<string, Row[]>;
  calls: GoalCall[];
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  /** rpc 이름별 에러 메시지. 있으면 그 rpc 가 실패한다. */
  rpcErrors: Record<string, string>;
}

export function createGoalDb(tables: Record<string, Row[]>): GoalDb {
  return { tables, calls: [], rpcCalls: [], rpcErrors: {} };
}

const compare = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b));

/** "col.ilike.%v%,col2.ilike.%v%" 를 대소문자 무시 부분일치로 푼다. */
function matchOr(row: Row, expression: string) {
  return expression.split(",").some((part) => {
    const [column = "", , pattern = ""] = part.split(".");
    const needle = pattern.replaceAll("%", "").toLowerCase();
    return String(row[column] ?? "")
      .toLowerCase()
      .includes(needle);
  });
}

class Builder {
  private call: GoalCall;
  private mode: "many" | "maybeSingle" = "many";

  constructor(
    private db: GoalDb,
    private table: string,
    op: "select" | "write",
  ) {
    this.call = { table, op, filters: [], orders: [], count: false };
    db.calls.push(this.call);
  }

  select(columns?: string, options?: { count?: string }) {
    this.call.columns = columns;
    this.call.count = options?.count === "exact";
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.filters.push([column, "eq", value]);
    return this;
  }
  in(column: string, value: unknown[]) {
    this.call.filters.push([column, "in", value]);
    return this;
  }
  lt(column: string, value: unknown) {
    this.call.filters.push([column, "lt", value]);
    return this;
  }
  or(expression: string) {
    this.call.or = expression;
    return this;
  }
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) {
    this.call.orders.push([
      column,
      options?.ascending ?? true,
      options?.nullsFirst,
    ]);
    return this;
  }
  range(from: number, to: number) {
    this.call.range = [from, to];
    return this;
  }
  limit(count: number) {
    this.call.limit = count;
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  private matches(row: Row) {
    const filtersOk = this.call.filters.every(([column, kind, value]) => {
      const cell = row[column];
      if (kind === "in") return (value as unknown[]).includes(cell);
      // SQL 처럼 null 은 비교에 걸리지 않는다.
      if (kind === "lt") return cell != null && compare(cell, value) < 0;
      return String(cell) === String(value);
    });
    return filtersOk && (!this.call.or || matchOr(row, this.call.or));
  }

  private run() {
    let rows = (this.db.tables[this.table] ?? []).filter((row) =>
      this.matches(row),
    );
    const total = rows.length;
    const { orders, range, limit } = this.call;
    if (orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const [column, ascending, nullsFirst] of orders) {
          const aNull = a[column] == null;
          const bNull = b[column] == null;
          if (aNull !== bNull) {
            const first = nullsFirst ?? !ascending;
            return aNull === first ? -1 : 1;
          }
          const diff = aNull ? 0 : compare(a[column], b[column]);
          if (diff !== 0) return ascending ? diff : -diff;
        }
        return 0;
      });
    }
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (limit !== undefined) rows = rows.slice(0, limit);
    const columns = this.call.columns;
    if (columns && columns.trim() !== "*") {
      const picked = columns.split(",").map((c) => c.trim());
      rows = rows.map((row) =>
        Object.fromEntries(picked.map((c) => [c, row[c]])),
      );
    }
    const count = this.call.count ? total : null;
    if (this.mode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }

  // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
  then(resolve: (value: unknown) => unknown) {
    return resolve(this.run());
  }
}

/** goal 테이블은 메모리 DB 로, 나머지(rpc, auth, profiles 권한 행)는 consoleTestKit 가짜로 보낸다. */
export function createGoalAdmin(state: KitState, db: GoalDb) {
  const base = createFakeAdmin(state);
  return {
    ...base,
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "fn_goal_reset_student") {
        db.rpcCalls.push({ name, args });
        const message = db.rpcErrors[name];
        return Promise.resolve({
          data: null,
          error: message ? { message } : null,
        });
      }
      return base.rpc(name, args);
    },
    from: (table: string) =>
      table in db.tables
        ? {
            // 관리자 판정이 profiles.role 을 읽는다. 그 한 가지 읽기만 권한 가짜로 보낸다.
            select: (columns?: string, options?: { count?: string }) =>
              table === "profiles" && columns === "role"
                ? (base.from(table) as { select: () => unknown }).select()
                : new Builder(db, table, "select").select(columns, options),
            insert: () => new Builder(db, table, "write"),
            update: () => new Builder(db, table, "write"),
            upsert: () => new Builder(db, table, "write"),
            delete: () => new Builder(db, table, "write"),
          }
        : base.from(table),
  };
}
