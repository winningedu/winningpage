// 학생 조사의 학과, 대학 검색.
// 검색 소스는 admission_result_department_index, admission_result_university_index 뷰다.
// 순수 함수(결과 분기, 중복 제거, 선택 규칙)와 supabase 조회를 한 파일에 둔다.

import type { SurveyPick } from "@/lib/growth/api";
import { supabase } from "@/lib/supabase";
import { normalizeUniversityKey } from "../../../../api/_lib/growth/report/admissionCut";
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

type SearchSource = {
  view:
    | "admission_result_department_index"
    | "admission_result_university_index";
  column: "department_name" | "university_name";
  /** ilike 로 거르는 열. 생략하면 표시 열(column)로 거른다. */
  filterColumn?: "department_name" | "university_name" | "university_key";
};

const DEPARTMENT_SOURCE: SearchSource = {
  view: "admission_result_department_index",
  column: "department_name",
};
const UNIVERSITY_SOURCE: SearchSource = {
  view: "admission_result_university_index",
  column: "university_name",
  // 입력은 정규화 키 형태라 이름이 아니라 같은 정규화를 거친 university_key 로 거른다.
  filterColumn: "university_key",
};

// 색인 뷰가 (대학, 학과) 단위로 이미 distinct 라서 원본 테이블보다 적은 행으로 충분하다.
// 서로 다른 대학의 같은 학과명이 겹칠 수 있어 buildSearchRows 로 한 번 더 걷는다.
async function searchView(
  { view, column, filterColumn = column }: SearchSource,
  term: string,
): Promise<string[]> {
  if (term === "") return [];
  const { data, error } = await supabase
    .from(view)
    .select(column)
    .ilike(filterColumn, `%${escapeIlike(term)}%`)
    .order(column, { ascending: true })
    .limit(SEARCH_ROW_LIMIT);
  if (error) {
    console.error("[growth/survey] 검색 실패:", error);
    return [];
  }
  const rows = (data as unknown as Record<string, string | null>[]).map(
    (row) => ({ name: row[column] ?? null }),
  );
  return buildSearchRows(rows).slice(0, SEARCH_RESULT_MAX);
}

export const searchDepartments = (term: string) =>
  searchView(DEPARTMENT_SOURCE, term.trim());
/** DB 대학명은 "고려대" 같은 축약형이라 "고려대학교" 입력도 정규화해서 찾는다. */
export const searchUniversities = (term: string) =>
  searchView(UNIVERSITY_SOURCE, normalizeUniversityKey(term));
