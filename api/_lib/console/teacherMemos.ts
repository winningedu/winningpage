// 교사 메모 공용(W9). 목록 한 줄의 모양과 작성자 이름 읽기.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleActor } from "./actor.js";
import { readAll } from "./directory.js";

export interface MemoRow {
  id: string;
  student_id: string;
  author_teacher_id: string;
  body: string;
  request_id: string;
  created_at: string;
  hidden_at: string | null;
}

export const MEMO_COLUMNS =
  "id, student_id, author_teacher_id, body, request_id, created_at, hidden_at";
export const MEMO_MAX_LENGTH = 2000;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadAuthorNames(
  admin: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await readAll<{ id: string; name: string }>(
    admin,
    "teachers",
    "id, name",
    (q) => q.eq("tenant_id", tenantId).in("id", unique),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function toMemoItem(
  row: MemoRow,
  actor: ConsoleActor,
  names: Map<string, string>,
) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: names.get(row.author_teacher_id) ?? "",
    canDelete:
      actor.teacherId !== null && row.author_teacher_id === actor.teacherId,
  };
}
