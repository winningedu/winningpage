// 콘솔 읽기 라우트가 함께 쓰는 조회 도우미. 서비스 롤 클라이언트로 기관 범위의 행을 읽는다.
// 쿼리 빌더 타입을 그대로 넘기면 타입 깊이 한계를 넘으므로 쓰는 메서드만 좁힌다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_GRADES } from "./enrollmentInput.js";
import { fetchAllRows } from "./paging.js";

export interface ReadQuery<Row>
  extends PromiseLike<{
    data: Row[] | null;
    error: unknown;
  }> {
  eq(column: string, value: string | number): ReadQuery<Row>;
  in(column: string, values: string[]): ReadQuery<Row>;
  order(column: string): ReadQuery<Row>;
  range(from: number, to: number): ReadQuery<Row>;
}

export function readQuery<Row>(
  admin: SupabaseClient,
  table: string,
  columns: string,
): ReadQuery<Row> {
  return admin.from(table).select(columns) as unknown as ReadQuery<Row>;
}

/** 조건을 건 쿼리를 id 순으로 끝까지 읽는다(쪽마다 순서가 같아야 행이 빠지거나 겹치지 않는다). */
export function readAll<Row>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  where: (query: ReadQuery<Row>) => ReadQuery<Row>,
): Promise<Row[]> {
  return fetchAllRows<Row>((from, to) =>
    where(readQuery<Row>(admin, table, columns))
      .order("id")
      .range(from, to),
  );
}

export interface TenantInfo {
  schoolYear: number;
  orgType: string | null;
}

export async function loadTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TenantInfo> {
  const { data, error } = await admin
    .from("tenants")
    .select("school_year, org_type")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) throw new Error("tenant lookup failed");
  return { schoolYear: data.school_year, orgType: data.org_type };
}

/** 삭제된 그룹도 이름을 읽는다(지난 학급이 가리킬 수 있다). */
export async function loadGroupNames(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Map<string, string>> {
  const groups = await readAll<{ id: string; name: string }>(
    admin,
    "class_groups",
    "id, name",
    (q) => q.eq("tenant_id", tenantId),
  );
  return new Map(groups.map((g) => [g.id, g.name]));
}

/** 담임이 정해진 학급 id. */
export async function loadHomeroomClassIds(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await readAll<{ class_id: string }>(
    admin,
    "teacher_class_assignments",
    "class_id",
    (q) => q.eq("tenant_id", tenantId),
  );
  return new Set(rows.map((r) => r.class_id));
}

/** 학년 순서(중1 부터 고3). 모르는 값은 뒤로. */
export function gradeRank(grade: string | null): number {
  const index = (ENROLLMENT_GRADES as readonly (string | null)[]).indexOf(
    grade,
  );
  return index === -1 ? ENROLLMENT_GRADES.length : index;
}

/** 반 이름 정렬: 숫자는 크기순(3 이 10 앞), 나머지는 가나다순. */
export function compareClassName(a: string, b: string): number {
  return a.localeCompare(b, "ko", { numeric: true });
}
