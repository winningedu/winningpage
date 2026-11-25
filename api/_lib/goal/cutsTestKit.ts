// 목표관리 컷 라우트 테스트용 메모리 DB. 테스트 파일에서만 import 한다.
// sectionTestKit 은 upsert, is, lte, head 카운트를 몰라서 이 도메인에 필요한 만큼만 따로 흉내 낸다.
// 인증과 권한(rpc)은 consoleTestKit 가짜에 맡긴다.

import { createFakeAdmin, type KitState } from "../console/consoleTestKit.js";

export type Row = Record<string, unknown>;
type Op = "select" | "insert" | "upsert" | "update";
type Kind = "eq" | "in" | "gte" | "lte" | "is";

export interface CutsCall {
  table: string;
  op: Op;
  filters: [column: string, kind: Kind, value: unknown][];
  orders: [column: string, ascending: boolean][];
  range?: [from: number, to: number];
  head: boolean;
  count: boolean;
  columns?: string;
  values?: Row | Row[];
  onConflict?: string;
}

export interface CutsDb {
  tables: Record<string, Row[]>;
  calls: CutsCall[];
  /** 테이블별 유일 키 열 목록. insert 가 겹치면 23505 로 실패한다. */
  unique: Record<string, string[]>;
  /** 호출을 받아 에러를 돌려주면 그 쿼리가 실패한다(쓰기 실패 주입용). */
  fail?: (call: CutsCall) => unknown;
}

export function createCutsDb(tables: Record<string, Row[]>): CutsDb {
  return { tables, calls: [], unique: {} };
}

const same = (a: unknown, b: unknown) => String(a) === String(b);
const order = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b));

class Builder {
  private call: CutsCall;
  private returning = false;

  constructor(
    private db: CutsDb,
    op: Op,
    private table: string,
    values?: Row | Row[],
    onConflict?: string,
  ) {
    this.call = {
      table,
      op,
      filters: [],
      orders: [],
      head: false,
      count: false,
      ...(values ? { values } : {}),
      ...(onConflict ? { onConflict } : {}),
    };
    db.calls.push(this.call);
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.call.op === "select") {
      if (columns) this.call.columns = columns;
      this.call.count = options?.count === "exact";
      this.call.head = options?.head === true;
    } else this.returning = true;
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
  gte(column: string, value: unknown) {
    this.call.filters.push([column, "gte", value]);
    return this;
  }
  lte(column: string, value: unknown) {
    this.call.filters.push([column, "lte", value]);
    return this;
  }
  is(column: string, value: unknown) {
    this.call.filters.push([column, "is", value]);
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

  private matches(row: Row) {
    return this.call.filters.every(([column, kind, value]) => {
      const cell = row[column];
      if (kind === "in") return (value as unknown[]).some((v) => same(v, cell));
      if (kind === "gte") return cell != null && order(cell, value) >= 0;
      if (kind === "lte") return cell != null && order(cell, value) <= 0;
      if (kind === "is") return value === null ? cell == null : cell === value;
      return same(cell, value);
    });
  }

  private conflict(row: Row, keys: string[]) {
    return (this.db.tables[this.table] ?? []).find((r) =>
      keys.every((k) => same(r[k], row[k])),
    );
  }

  private run(): { data: unknown; error: unknown; count: number | null } {
    const injected = this.db.fail?.(this.call);
    if (injected) return { data: null, error: injected, count: null };
    const rows = this.db.tables[this.table] ?? [];
    this.db.tables[this.table] = rows;
    const { op } = this.call;
    let affected: Row[] = [];
    if (op === "insert" || op === "upsert") {
      const batch = [this.call.values].flat() as Row[];
      const keys = (
        op === "upsert"
          ? (this.call.onConflict ?? "id").split(",")
          : (this.db.unique[this.table] ?? [])
      ).map((k) => k.trim());
      for (const row of batch) {
        const hit = keys.length ? this.conflict(row, keys) : undefined;
        if (hit && op === "insert") {
          return {
            data: null,
            error: {
              code: "23505",
              message: "duplicate key value",
              details: `Key (${keys.join(", ")})=(x) already exists.`,
            },
            count: null,
          };
        }
        if (hit) {
          Object.assign(hit, row);
          affected.push(hit);
        } else {
          const created = { id: rows.length + 1000, ...row };
          rows.push(created);
          affected.push(created);
        }
      }
    } else if (op === "update") {
      affected = rows.filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.call.values);
    } else {
      affected = rows.filter((row) => this.matches(row));
    }
    const total = affected.length;
    if (op === "select") {
      const { orders, range } = this.call;
      if (orders.length > 0) {
        affected = [...affected].sort((a, b) => {
          for (const [column, ascending] of orders) {
            const diff = order(a[column], b[column]);
            if (diff !== 0) return ascending ? diff : -diff;
          }
          return 0;
        });
      }
      if (range) affected = affected.slice(range[0], range[1] + 1);
    }
    const count = this.call.count ? total : null;
    if (this.call.head) return { data: null, error: null, count };
    if (op !== "select" && !this.returning)
      return { data: null, error: null, count };
    return { data: affected, error: null, count };
  }

  // biome-ignore lint/suspicious/noThenProperty: Supabase 쿼리 빌더처럼 await 할 수 있어야 한다.
  then(resolve: (value: unknown) => unknown) {
    return resolve(this.run());
  }
}

/** 컷 테이블은 메모리 DB 로, 나머지(rpc, auth)는 consoleTestKit 가짜로 보낸다. */
export function createCutsAdmin(state: KitState, db: CutsDb) {
  const base = createFakeAdmin(state);
  return {
    ...base,
    from: (table: string) =>
      table in db.tables
        ? {
            select: (
              columns?: string,
              options?: { count?: string; head?: boolean },
            ) => new Builder(db, "select", table).select(columns, options),
            insert: (values: Row | Row[]) =>
              new Builder(db, "insert", table, values),
            upsert: (values: Row | Row[], options?: { onConflict?: string }) =>
              new Builder(db, "upsert", table, values, options?.onConflict),
            update: (values: Row) => new Builder(db, "update", table, values),
          }
        : base.from(table),
  };
}
