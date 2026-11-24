// 섹션 엔진 서버 쪽 규칙. 화면(Admin.tsx buildListQuery, saveRow)이 브라우저에서 하던 일을 옮겼다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { RouteParamError } from "../handler.js";
import { sendError } from "../httpResponse.js";
import {
  getSection,
  PROTECTED_COLUMNS,
  type SectionEntry,
} from "./registry.js";

interface ListOptions {
  q?: string | undefined;
  /** true 면 전체 건수를 함께 센다. */
  count?: boolean;
}

interface Scopable<Q> {
  in(column: string, values: readonly unknown[]): Q;
  eq(column: string, value: unknown): Q;
}

/**
 * 한 행 읽기, 수정, 삭제에 섹션 소속 조건(고정 구분, 고정 값)을 건다. 같은 테이블을 나눠 쓰는 섹션
 * (지식 DB 두 종류, 수시와 정시 글)이 id 만 알면 서로의 행을 읽고 지우지 못하게 한다. 목록과 같은 조건이다.
 */
export function scopeToSection<Q extends Scopable<Q>>(
  query: Q,
  entry: SectionEntry,
): Q {
  let scoped = query;
  if (entry.fixedCategories) {
    scoped = scoped.in("category", entry.fixedCategories);
  }
  for (const [column, value] of Object.entries(entry.fixedValues ?? {})) {
    scoped = scoped.eq(column, value);
  }
  return scoped;
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

/**
 * sort_order 를 특정 값으로 지정해 저장하면 그 값부터 빈틈없이 이어지는 구간을 +1 씩 민다.
 * 큰 값부터 한 행씩 올리고 트랜잭션은 없다(화면 saveRow 와 같다). 수정이면 자기 행은 뺀다.
 */
export async function shiftSortOrder(
  admin: SupabaseClient,
  entry: SectionEntry,
  target: number,
  excludeId?: string,
): Promise<void> {
  let conflicts = admin
    .from(entry.table)
    .select("id, sort_order")
    .gte("sort_order", target)
    .order("sort_order", { ascending: true });
  if (excludeId !== undefined) conflicts = conflicts.neq("id", excludeId);
  const { data, error } = await conflicts;
  if (error) throw new Error(`${entry.table} sort_order read failed`);

  // 지정값부터 빈틈없이 이어지는 구간만 민다(1,2,3,5 중 2 를 지정하면 2, 3 만 민다).
  const run: { id: string; sort_order: number }[] = [];
  let expected = target;
  for (const row of (data ?? []) as { id: string; sort_order: number }[]) {
    if (Number(row.sort_order) !== expected) break;
    run.push(row);
    expected += 1;
  }

  for (const row of run.reverse()) {
    const { error: updateError } = await admin
      .from(entry.table)
      .update({ sort_order: Number(row.sort_order) + 1 })
      .eq("id", row.id);
    if (updateError) throw new Error(`${entry.table} sort_order shift failed`);
  }
}

export interface MappedDbError {
  status: number;
  code: string;
  detail: string;
  /** 컬럼 이름(23514 는 제약 이름)만. 값은 절대 싣지 않는다. */
  columns: string[];
}

// 유니크 인덱스가 식이면 details 에 coalesce(title, ''::text) 처럼 식이 실린다. 첫 식별자를 컬럼으로 본다.
const SQL_NOISE = new Set([
  "coalesce",
  "lower",
  "upper",
  "trim",
  "btrim",
  "both",
  "from",
  "text",
  "int",
  "integer",
]);

/** `Key (a, coalesce(b, ''::text))=(값)` 의 괄호 안 컬럼 목록. 값 부분은 읽지 않는다(adminErrors.ts 와 같은 해석). */
function uniqueKeyColumns(details: string | undefined): string[] {
  const inner = details?.match(/Key \((.*?)\)=\(/)?.[1];
  if (!inner) return [];
  // 최상위 콤마로만 자른다. coalesce(x, '') 안쪽 콤마에 걸리면 안 된다.
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const char of inner) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  parts.push(buffer);
  return parts.flatMap((part) => {
    const names: string[] = part.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
    const token = names.find((name) => !SQL_NOISE.has(name.toLowerCase()));
    return token ? [token] : [];
  });
}

interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

/**
 * 쓰기 DB 오류를 응답으로 바꾼다. 원문 message, details 는 보내지 않는다(details 에 중복된 값이 있다).
 * 문구는 화면 adminErrors.ts 의 기본 안내와 같다. 모르는 오류는 null(호출부가 던져 500 이 된다).
 */
export function mapDbError(
  error: DbErrorLike | null | undefined,
): MappedDbError | null {
  switch (error?.code) {
    case "23505":
      return {
        status: 409,
        code: "DB_UNIQUE_VIOLATION",
        detail: "이미 등록된 값입니다(중복).",
        columns: uniqueKeyColumns(error.details),
      };
    case "23502": {
      const column = error.message?.match(
        /null value in column "([^"]+)"/,
      )?.[1];
      return {
        status: 400,
        code: "DB_NOT_NULL_VIOLATION",
        detail: "필수 값이 비어 있습니다. 항목을 모두 입력해 주세요.",
        columns: column ? [column] : [],
      };
    }
    case "23514": {
      const constraint = error.message?.match(
        /violates check constraint "([^"]+)"/,
      )?.[1];
      return {
        status: 400,
        code: "DB_CHECK_VIOLATION",
        detail: "입력값이 저장 조건을 벗어났습니다. 값을 다시 확인해 주세요.",
        columns: constraint ? [constraint] : [],
      };
    }
    default:
      return null;
  }
}

/** 경로의 섹션 키로 레지스트리 항목을 찾는다. 모르는 키는 400 VALIDATION_FAILED(RouteParamError). */
export function sectionOf(req: VercelRequest): SectionEntry {
  const entry = getSection(String(req.query.key ?? ""));
  if (!entry) throw new RouteParamError("key", "알 수 없는 섹션입니다.");
  return entry;
}

/** 메뉴 권한 키 = 섹션 키. 권한 판정보다 먼저 키를 검증해 모르는 키가 403 으로 보이지 않게 한다. */
export function sectionPermissionKey(req: VercelRequest): string {
  sectionOf(req);
  return String(req.query.key);
}

const valuesBody = z.object({ values: z.record(z.string(), z.unknown()) });

/** 쓰기 요청 본문의 values 객체. 없거나 객체가 아니면 400 VALIDATION_FAILED. */
export function valuesOf(req: VercelRequest): Values {
  const parsed = valuesBody.safeParse(req.body);
  if (!parsed.success) {
    throw new RouteParamError("values", "values 객체가 필요합니다.");
  }
  return parsed.data.values;
}

/** 이 섹션에서 허용하지 않는 동작(읽기 전용 섹션 쓰기, 등록 불가 섹션 등록 등). */
export function notAllowed(message: string): never {
  throw new RouteParamError("key", message);
}

/** payload 정리 실패(모르는 키, 잘못된 구분)를 400 VALIDATION_FAILED 로 보낸다. */
export function sendRejectedPayload(
  res: VercelResponse,
  rejected: Extract<PayloadResult, { ok: false }>,
): void {
  const errors = rejected.badCategory
    ? [
        {
          path: "values.category",
          message: "수시 또는 정시 구분을 선택해 주세요.",
        },
      ]
    : rejected.unknownKeys.map((column) => ({
        path: `values.${column}`,
        message: "저장할 수 없는 항목입니다.",
      }));
  sendError(
    res,
    "problem",
    400,
    "요청 값이 올바르지 않아요.",
    "VALIDATION_FAILED",
    { errors },
  );
}

/** 쓰기 쿼리 오류를 계약대로 응답한다. 매핑에 없는 오류는 던져 500 이 된다(원문은 로그에만). */
export function failWrite(
  res: VercelResponse,
  error: DbErrorLike,
  label: string,
): void {
  const mapped = mapDbError(error);
  if (!mapped) throw new Error(`${label} failed (${error.code ?? "unknown"})`);
  sendError(res, "problem", mapped.status, mapped.detail, mapped.code, {
    columns: mapped.columns,
  });
}

/** 맞는 행이 없을 때 404 NOT_FOUND. */
export function sendNotFound(res: VercelResponse): void {
  sendError(res, "problem", 404, "해당 항목을 찾을 수 없습니다.", "NOT_FOUND");
}
