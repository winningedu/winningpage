// 목표관리 컷(goal_university_cuts) 서버 공용 읽기. 화면(GoalCutsPanels)이 브라우저에서 하던 조회를 옮겼다.

import type { SupabaseClient } from "@supabase/supabase-js";

export const GOAL_CUTS_TABLE = "goal_university_cuts";
// (대학, 학과) 단위로 접힌 뷰. has_normal, has_special, has_jungsi 플래그를 준다.
const GOAL_CUTS_OPTIONS_VIEW = "goal_university_options";
// PostgREST 응답 상한(1,000행)에 맞춘 읽기 청크.
export const GOAL_CUTS_READ_CHUNK = 1000;

function countQuery(admin: SupabaseClient) {
  return admin
    .from(GOAL_CUTS_TABLE)
    .select("id", { count: "exact", head: true });
}

export async function countCuts(
  admin: SupabaseClient,
  applyFilters?: (
    query: ReturnType<typeof countQuery>,
  ) => ReturnType<typeof countQuery>,
): Promise<number> {
  const base = countQuery(admin);
  const { count, error } = await (applyFilters ? applyFilters(base) : base);
  if (error) throw new Error("goal cuts count failed");
  return count ?? 0;
}

export interface GoalCutOptionRow {
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  has_normal: boolean;
  has_special: boolean;
  has_jungsi: boolean;
}

// 뷰에는 id 가 없어 group by 축(university_key, department_key)으로 정렬한다. 조합이 유일하다.
export async function fetchOptionRows(
  admin: SupabaseClient,
): Promise<GoalCutOptionRow[]> {
  const { count, error: countError } = await admin
    .from(GOAL_CUTS_OPTIONS_VIEW)
    .select("university_key", { count: "exact", head: true });
  if (countError) throw new Error("goal options count failed");
  const total = count ?? 0;
  const all: GoalCutOptionRow[] = [];
  for (let from = 0; from < total; from += GOAL_CUTS_READ_CHUNK) {
    const { data, error } = await admin
      .from(GOAL_CUTS_OPTIONS_VIEW)
      .select(
        "university_key, university_name, department_key, department_name, has_normal, has_special, has_jungsi",
      )
      .order("university_key", { ascending: true })
      .order("department_key", { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error("goal options read failed");
    if (!data || data.length === 0) break;
    all.push(...(data as GoalCutOptionRow[]));
  }
  return all;
}
