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
  gte(column: string, value: string | number): ReadQuery<Row>;
  order(column: string, options?: { ascending: boolean }): ReadQuery<Row>;
  limit(count: number): ReadQuery<Row>;
  range(from: number, to: number): ReadQuery<Row>;
}

export function readQuery<Row>(
  admin: SupabaseClient,
  table: string,
  columns: string,
): ReadQuery<Row> {
  return admin.from(table).select(columns) as unknown as ReadQuery<Row>;
}

/**
 * 조건을 건 쿼리를 orderBy(기본 id) 순으로 끝까지 읽는다. 쪽마다 순서가 같아야 행이 빠지거나 겹치지 않으니
 * id 열이 없는 테이블은 유일한 열을 넘긴다.
 */
export function readAll<Row>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  where: (query: ReadQuery<Row>) => ReadQuery<Row>,
  orderBy = "id",
): Promise<Row[]> {
  return fetchAllRows<Row>((from, to) =>
    where(readQuery<Row>(admin, table, columns))
      .order(orderBy)
      .range(from, to),
  );
}

/** created_at 이 가장 늦은 한 행. 조건에 맞는 행을 전부 읽지 않고 DB 에서 한 행만 가져온다. */
export async function readLatest<Row>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  where: (query: ReadQuery<Row>) => ReadQuery<Row>,
): Promise<Row | undefined> {
  const { data, error } = await where(readQuery<Row>(admin, table, columns))
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`${table} latest read failed`);
  return data?.[0];
}

export interface TenantInfo {
  schoolYear: number;
  orgType: string | null;
  isCatchAll: boolean;
}

export async function loadTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TenantInfo> {
  const { data, error } = await admin
    .from("tenants")
    .select("school_year, org_type, is_catch_all")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) throw new Error("tenant lookup failed");
  return {
    schoolYear: data.school_year,
    orgType: data.org_type,
    isCatchAll: data.is_catch_all === true,
  };
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
    "class_id",
  );
  return new Set(rows.map((r) => r.class_id));
}

/** 학급의 담임 이름. 담임이 없거나 학급이 없으면 null. */
export async function loadHomeroomName(
  admin: SupabaseClient,
  tenantId: string,
  classId: string | null,
): Promise<string | null> {
  if (!classId) return null;
  const [assignment] = await readAll<{ teacher_id: string }>(
    admin,
    "teacher_class_assignments",
    "teacher_id",
    (q) => q.eq("tenant_id", tenantId).eq("class_id", classId),
    "teacher_id",
  );
  if (!assignment) return null;
  const [teacher] = await readAll<{ name: string }>(
    admin,
    "teachers",
    "name",
    (q) => q.eq("tenant_id", tenantId).eq("id", assignment.teacher_id),
  );
  return teacher?.name ?? null;
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

export interface ClassInfo {
  id: string;
  schoolYear: number;
  grade: string | null;
  groupId: string | null;
  groupName: string | null;
  name: string;
}

/** 기관의 모든 학년도 학급을 id 로 찾게 모은다(이력은 지난 학년도 학급도 가리킨다). */
export async function loadClassIndex(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Map<string, ClassInfo>> {
  const [classes, groupNames] = await Promise.all([
    readAll<{
      id: string;
      school_year: number;
      grade: string | null;
      group_id: string | null;
      name: string;
    }>(admin, "classes", "id, school_year, grade, group_id, name", (q) =>
      q.eq("tenant_id", tenantId),
    ),
    loadGroupNames(admin, tenantId),
  ]);
  return new Map(
    classes.map((c) => [
      c.id,
      {
        id: c.id,
        schoolYear: c.school_year,
        grade: c.grade,
        groupId: c.group_id,
        groupName: c.group_id ? (groupNames.get(c.group_id) ?? null) : null,
        name: c.name,
      },
    ]),
  );
}

const PROFILE_CHUNK = 100;

/** 학생 이름. in 목록이 URL 한도를 넘지 않게 100명씩 나눠 읽는다. */
export async function loadProfileNames(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += PROFILE_CHUNK) {
    chunks.push(unique.slice(i, i + PROFILE_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      readAll<{ id: string; name: string | null }>(
        admin,
        "profiles",
        "id, name",
        (q) => q.in("id", chunk),
      ),
    ),
  );
  return new Map(
    pages.flat().map((p) => [p.id, p.name ?? ""] as [string, string]),
  );
}

export interface SlotLabel {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

/** 학급 하나의 표기(그룹, 반 이름)를 읽어 학년, 번호와 묶는다. 학급이 없으면 그룹과 반은 null. */
export async function loadSlotLabel(
  admin: SupabaseClient,
  tenantId: string,
  slot: { grade: string | null; classId: string | null; number: number | null },
): Promise<SlotLabel> {
  const label: SlotLabel = {
    grade: slot.grade,
    groupName: null,
    className: null,
    number: slot.number,
  };
  if (!slot.classId) return label;
  const { data: cls, error } = await admin
    .from("classes")
    .select("group_id, name")
    .eq("id", slot.classId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error("class lookup failed");
  if (!cls) return label;
  label.className = cls.name;
  if (cls.group_id) {
    const { data: group, error: groupError } = await admin
      .from("class_groups")
      .select("name")
      .eq("id", cls.group_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (groupError) throw new Error("class group lookup failed");
    label.groupName = group?.name ?? null;
  }
  return label;
}
