// 학습진단 질문, 답변, 추천 프로그램 라우트가 같이 쓰는 목록, 등록, 수정, 삭제 처리.
// 서비스 롤은 RLS 를 건너뛰므로 옛 RLS(관리자 ALL)가 허용한 동작만 연다. 쓰기가 닿은 행이 없으면 404 다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "../hono/problem.js";

export type Table =
  | "learning_diagnosis_questions"
  | "learning_diagnosis_options"
  | "learning_diagnosis_programs";

/** option_text 는 옛 NOT NULL 컬럼이라 label 을 그대로 미러링한다. */
export function withOptionText<T extends { label: string }>(body: T) {
  return { ...body, option_text: body.label };
}

/** 목록. 정렬은 옛 화면과 같다. */
export async function listRows(db: SupabaseClient, table: Table) {
  const { data, error } = await db
    .from(table)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("learning diagnosis read failed");
  return data ?? [];
}

/** 등록. 상위 질문이 없으면 FK 위반이라 404 다. */
export async function insertRow(
  db: SupabaseClient,
  table: Table,
  what: string,
  row: Record<string, unknown>,
) {
  const { data, error } = await db.from(table).insert(row).select("*").single();
  if (error) {
    if (error.code === "23503") throw notFound(what);
    throw new Error("learning diagnosis insert failed");
  }
  return data;
}

/** 수정. 닿은 행이 없으면 404 다. */
export async function updateRow(
  db: SupabaseClient,
  table: Table,
  what: string,
  id: string,
  row: Record<string, unknown>,
) {
  const { data, error } = await db
    .from(table)
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error("learning diagnosis update failed");
  if (!data) throw notFound(what);
  return data;
}

/** 삭제. 닿은 행이 없으면 404 다. */
export async function deleteRow(
  db: SupabaseClient,
  table: Table,
  what: string,
  id: string,
): Promise<void> {
  const { data, error } = await db
    .from(table)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error("learning diagnosis delete failed");
  if (!data || data.length === 0) throw notFound(what);
}
