// 섹션 엔진 서버 쪽 규칙. 화면(Admin.tsx buildListQuery, saveRow)이 브라우저에서 하던 일을 옮겼다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROTECTED_COLUMNS, type SectionEntry } from "./registry.js";

interface ListOptions {
  q?: string;
  /** true 면 전체 건수를 함께 센다. */
  count?: boolean;
}

/**
 * 목록과 내보내기가 같은 조건을 보게 하는 쿼리. 범위(range)는 호출부가 붙인다.
 * 조건, 검색 이스케이프, 정렬은 Admin.tsx buildListQuery 와 같다.
 */
export function buildListQuery(
  admin: SupabaseClient,
  entry: SectionEntry,
  { q, count }: ListOptions = {},
) {
  let query = admin
    .from(entry.listTable ?? entry.table)
    .select("*", count ? { count: "exact" } : undefined);

  if (entry.fixedCategories) {
    query = query.in("category", [...entry.fixedCategories]);
  }
  for (const [column, value] of Object.entries(entry.fixedValues ?? {})) {
    query = query.eq(column, value);
  }

  // 검색은 서버 페이지 섹션에만 있다. 나머지는 전량을 받아 화면이 거른다.
  if (entry.serverPaginate && q && entry.searchColumns?.length) {
    // PostgREST or() 는 콤마로 조건을, 괄호로 그룹을 끊는다. 그 문자가 들어오면 구문이 깨지고,
    // %, _ 는 ilike 와일드카드로 새므로 공백으로 바꾼다.
    const safe = q.replace(/[,()%_\\*]/g, " ").trim();
    if (safe) {
      query = query.or(
        entry.searchColumns
          .map((column) => `${column}.ilike.%${safe}%`)
          .join(","),
      );
    }
  }

  const orderColumn = entry.order ?? "created_at";
  if (entry.orderBy) {
    for (const [column, ascending] of entry.orderBy) {
      query = query.order(column, { ascending });
    }
  } else if (entry.fixedCategories) {
    query = query
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
  } else {
    query = query.order(orderColumn, {
      ascending: orderColumn === "sort_order",
    });
  }

  return query;
}

type Values = Record<string, unknown>;

export type PayloadResult =
  | { ok: true; payload: Values }
  | { ok: false; unknownKeys: string[]; badCategory?: true };

/**
 * 쓰기 값을 saveRow 와 같은 순서로 정리한다(계약 1~4번).
 * 1 보호 컬럼, 목록 전용 컬럼, 편집 필드가 없는 view_count 는 조용히 뗀다.
 * 2 남은 키가 writable 에 없으면 거절한다(오타와 모르는 키).
 * 3 fixed 면 고정 값을 덮어쓰고, 4 고정 구분 섹션은 category 가 목록 안에 있어야 한다.
 */
export function buildPayload(
  entry: SectionEntry,
  values: Values,
  { fixed = false }: { fixed?: boolean } = {},
): PayloadResult {
  const dropped = new Set<string>([
    ...PROTECTED_COLUMNS,
    ...entry.listOnlyColumns,
  ]);
  if (!entry.viewCountEditable) dropped.add("view_count");

  const writable = new Set(entry.writable);
  const payload: Values = {};
  const unknownKeys: string[] = [];
  for (const [column, value] of Object.entries(values)) {
    if (dropped.has(column)) continue;
    if (writable.has(column)) payload[column] = value;
    else unknownKeys.push(column);
  }
  if (unknownKeys.length > 0) return { ok: false, unknownKeys };

  if (fixed) {
    Object.assign(payload, entry.fixedValues);
    if (
      entry.fixedCategories &&
      !entry.fixedCategories.includes(payload.category as string)
    ) {
      return { ok: false, unknownKeys: [], badCategory: true };
    }
  }
  return { ok: true, payload };
}
