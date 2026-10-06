// 학생 조사의 학과, 대학 검색.
// 검색 소스는 admission_results(is_active=true)의 department_name, university_name 이다.
// 순수 함수(결과 분기, 중복 제거, 선택 규칙)와 supabase 조회를 한 파일에 둔다.
import type { SurveyPick } from "@/lib/growth/api";
import { supabase } from "@/lib/supabase";
import { UNIVERSITY_MAX } from "./surveyState";

export const SEARCH_DEBOUNCE_MS = 300;
// 같은 학과가 연도, 전형마다 여러 행이라 distinct 후 목록 길이를 넉넉히 확보하려면 행을 더 읽어야 한다.
const SEARCH_ROW_LIMIT = 400;
const SEARCH_RESULT_MAX = 12;

export type SearchOutcome = "idle" | "loading" | "results" | "empty";

/** 검색 상태를 화면 분기로 줄인다. empty 는 "직접 입력" 분기다(No.31, 시안 645:2057). */
export function searchOutcome({
  query,
  loading,
  results,
}: {
  query: string;
  loading: boolean;
  results: readonly string[];
}): SearchOutcome {
  if (query.trim() === "") return "idle";
  if (loading) return "loading";
  return results.length > 0 ? "results" : "empty";
}

/** 행 배열에서 빈 값과 중복을 걷는다(등장 순서 유지). */
export function buildSearchRows(
  rows: readonly { name: string | null }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 세 번째 대학을 고르면 가장 먼저 고른 대학이 빠진다(No.30). 같은 이름은 무시한다. */
export function pushUniversity(
  list: readonly SurveyPick[],
  item: SurveyPick,
): SurveyPick[] {
  if (list.some((u) => u.name === item.name)) return [...list];
  const kept =
    list.length >= UNIVERSITY_MAX
      ? list.slice(list.length - UNIVERSITY_MAX + 1)
      : list;
  return [...kept, item];
}

export function toggleOption(
  list: readonly string[],
  option: string,
): string[] {
  return list.includes(option)
    ? list.filter((v) => v !== option)
    : [...list, option];
}

type SearchColumn = "department_name" | "university_name";

async function searchColumn(
  column: SearchColumn,
  term: string,
): Promise<string[]> {
  const trimmed = term.trim();
  if (trimmed === "") return [];
  const { data, error } = await supabase
    .from("admission_results")
    .select(column)
    .eq("is_active", true)
    .ilike(column, `%${escapeIlike(trimmed)}%`)
    .order(column, { ascending: true })
    .limit(SEARCH_ROW_LIMIT);
  if (error) {
    console.error("[growth/survey] 검색 실패:", error);
    return [];
  }
  const rows = (data as unknown as Record<SearchColumn, string | null>[]).map(
    (row) => ({ name: row[column] }),
  );
  return buildSearchRows(rows).slice(0, SEARCH_RESULT_MAX);
}

export const searchDepartments = (term: string) =>
  searchColumn("department_name", term);
export const searchUniversities = (term: string) =>
  searchColumn("university_name", term);
