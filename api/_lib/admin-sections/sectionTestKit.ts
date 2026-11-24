// 섹션 라우트 테스트용 메모리 DB. 테스트 파일에서만 import 한다.
// consoleTestKit 의 가짜는 or, neq, insert().select().single() 을 모르고 필터를 기록만 해서,
// 인증과 권한(rpc)은 그 가짜를 쓰고 섹션 테이블만 여기서 실제 행에 필터를 적용해 흉내 낸다.
// 호출 기록(calls)으로 "어떤 쿼리를 걸었는지"도 단언할 수 있다.

import { createFakeAdmin, type KitState } from "../console/consoleTestKit.js";

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete";
type Filter = [
  column: string,
  kind: "eq" | "neq" | "in" | "gte",
  value: unknown,
];

export interface SectionCall {
  table: string;
  op: Op;
  filters: Filter[];
  or?: string;
  orders: [column: string, ascending: boolean][];
  range?: [from: number, to: number];
  limit?: number;
  count: boolean;
  values?: Row;
}

export interface SectionDb {
  tables: Record<string, Row[]>;
  calls: SectionCall[];
  /** 테이블과 동작이 맞으면 그 쿼리가 이 에러로 실패한다(계속 유지). */
  errors: { table: string; op: Op; error: unknown }[];
}

export function createSectionDb(tables: Record<string, Row[]>): SectionDb {
  return { tables, calls: [], errors: [] };
}

const compare = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b));

class Builder {
  private call: SectionCall;
  private returning = false;
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private db: SectionDb,
    private table: string,
    op: Op,
    values?: Row,
  ) {
    this.call = {
      table,
      op,
      filters: [],
      orders: [],
      count: false,
      ...(values ? { values } : {}),
    };
    db.calls.push(this.call);
  }

  select(_columns?: string, options?: { count?: string }) {
    if (this.call.op === "select") this.call.count = options?.count === "exact";
    else this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.call.filters.push([column, "eq", value]);
    return this;
  }
  neq(column: string, value: unknown) {
    this.call.filters.push([column, "neq", value]);
    return this;
  }
  in(column: string, value: unknown[]) {
    this.call.filters.push([column, "in", value]);
    return this;
  }
  gte(column: string, value: unknown) {
    this.call.filters.push([column, "gte", value]);
    return this;
  }
  // 검색 조건은 문자열 그대로 기록만 한다(ilike 적용은 DB 몫).
  or(expression: string) {
    this.call.or = expression;
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.call.orders.push([column, options?.ascending ?? true]);
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
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  private matches(row: Row) {
    return this.call.filters.every(([column, kind, value]) => {
      const cell = row[column];
      if (kind === "in") return (value as unknown[]).includes(cell);
      if (kind === "gte") return compare(cell, value) >= 0;
      return kind === "eq"
        ? String(cell) === String(value)
        : String(cell) !== String(value);
    });
  }

  private run(): { data: unknown; error: unknown; count?: number | null } {
    const { op } = this.call;
    const failure = this.db.errors.find(
      (entry) => entry.table === this.table && entry.op === op,
    );
    if (failure) return { data: null, error: failure.error };
    const rows = this.db.tables[this.table] ?? [];
    let affected: Row[] = [];
    if (op === "insert") {
      const row = { id: `new-${rows.length + 1}`, ...this.call.values };
      rows.push(row);
      affected = [row];
    } else if (op === "update") {
      affected = rows.filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.call.values);
    } else if (op === "delete") {
      affected = rows.filter((row) => this.matches(row));
      this.db.tables[this.table] = rows.filter(
        (row) => !affected.includes(row),
      );
    } else {
      affected = rows.filter((row) => this.matches(row));
    }
    const total = affected.length;
    if (op === "select") {
      const { orders, range } = this.call;
      if (orders.length > 0) {
        affected = [...affected].sort((a, b) => {
          for (const [column, ascending] of orders) {
            const diff = compare(a[column], b[column]);
            if (diff !== 0) return ascending ? diff : -diff;
          }
          return 0;
        });
      }
      if (range) affected = affected.slice(range[0], range[1] + 1);
      if (this.call.limit !== undefined) {
        affected = affected.slice(0, this.call.limit);
      }
    }
    const count = this.call.count ? total : null;
    if (op !== "select" && !this.returning) {
      return { data: null, error: null, count };
    }
    if (this.mode === "many") return { data: affected, error: null, count };
    if (affected[0]) return { data: affected[0], error: null, count };
    return this.mode === "single"
      ? { data: null, error: { code: "PGRST116", message: "no rows" }, count }
      : { data: null, error: null, count };
  }

  // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
  then(resolve: (value: unknown) => unknown) {
    return resolve(this.run());
  }
}

/** 관리자 로그인 + 그 메뉴 키 권한 등급을 심는다(none 이면 권한 행이 없다). */
export function seedAdmin(
  state: KitState,
  level: "view" | "edit" | "none",
  menuKey: string,
) {
  state.user = { id: "admin-1", email: "admin@example.com" };
  state.rows.profiles = () => ({ role: "admin" });
  state.rpc.fn_admin_effective_permissions = () => ({
    data: level === "none" ? [] : [{ resource_key: menuKey, level }],
    error: null,
  });
}

/** 섹션 테이블은 메모리 DB 로, 나머지(rpc, auth, profiles)는 consoleTestKit 가짜로 보낸다. */
export function createSectionAdmin(state: KitState, db: SectionDb) {
  const base = createFakeAdmin(state);
  return {
    ...base,
    from: (table: string) =>
      table in db.tables
        ? {
            select: (columns?: string, options?: { count?: string }) =>
              new Builder(db, table, "select").select(columns, options),
            insert: (values: Row) => new Builder(db, table, "insert", values),
            update: (values: Row) => new Builder(db, table, "update", values),
            delete: () => new Builder(db, table, "delete"),
          }
        : base.from(table),
  };
}
