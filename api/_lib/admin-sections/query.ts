// 섹션 엔진 서버 쪽 규칙. 화면(Admin.tsx buildListQuery, saveRow)이 브라우저에서 하던 일을 옮겼다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionEntry } from "./registry.js";

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
