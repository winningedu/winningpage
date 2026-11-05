// 교사 메모 공용(W9). 목록 한 줄의 모양과 작성자 이름 읽기.
// 작성자는 교사 또는 본사 대행 세션 중 하나다(결정 63). 대행 메모의 작성자 이름은 PROXY_AUTHOR_NAME 이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleActor } from "./actor.js";
import { readAll } from "./directory.js";

export interface MemoRow {
  id: string;
  student_id: string;
  author_teacher_id: string | null;
  proxy_session_id: string | null;
  body: string;
  request_id: string;
  created_at: string;
  hidden_at: string | null;
}

export const MEMO_COLUMNS =
  "id, student_id, author_teacher_id, proxy_session_id, body, request_id, created_at, hidden_at";
export const PROXY_AUTHOR_NAME = "본사 대행";
export const MEMO_MAX_LENGTH = 2000;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MemoAuthor {
  column: "author_teacher_id" | "proxy_session_id";
  id: string;
}

/** 이 요청이 메모 작성자로 쓰는 값. 교사도 대행 세션도 아니면 null. */
export function memoAuthorOf(actor: ConsoleActor): MemoAuthor | null {
  if (actor.teacherId !== null) {
    return { column: "author_teacher_id", id: actor.teacherId };
  }
  if (actor.proxySessionId !== null) {
    return { column: "proxy_session_id", id: actor.proxySessionId };
  }
  return null;
}

export function isMemoAuthor(row: MemoRow, actor: ConsoleActor): boolean {
  const author = memoAuthorOf(actor);
  return author !== null && row[author.column] === author.id;
}

export async function loadAuthorNames(
  admin: SupabaseClient,
  tenantId: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
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
    authorName: row.author_teacher_id
      ? (names.get(row.author_teacher_id) ?? "")
      : PROXY_AUTHOR_NAME,
    canDelete: isMemoAuthor(row, actor),
  };
}
