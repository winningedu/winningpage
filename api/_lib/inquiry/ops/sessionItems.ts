// 관리자 세션 목록과 상세가 같은 항목 모양을 쓰도록 행에 프로필 이름, 이메일, 선택 주제 제목을 붙이는 한 곳.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ProfileSummary,
  type SessionListItem,
  type SessionListRow,
  toSessionListItem,
} from "./list.js";

export const SESSION_COLUMNS =
  "id, profile_id, status, current_step, area, subject, activity_name, selected_topic_id, completed_at, last_activity_at, ledger_id, ledger_reversed_at, generation_state, evaluation_count, topic_round_count";

export async function toSessionItems(
  db: SupabaseClient,
  rows: SessionListRow[],
): Promise<SessionListItem[]> {
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const topicIds = [
    ...new Set(
      rows.map((r) => r.selected_topic_id).filter((v): v is string => !!v),
    ),
  ];
  // 두 읽기는 입력 행의 id 만 쓰므로 함께 시작한다. 오류는 프로필, 주제 순서로 본다.
  const [profileRead, topicRead] = await Promise.all([
    ids.length > 0
      ? db.from("profiles").select("id, name, email").in("id", ids)
      : null,
    topicIds.length > 0
      ? db.from("inquiry_topics").select("id, detail").in("id", topicIds)
      : null,
  ]);

  const profiles = new Map<string, ProfileSummary>();
  if (profileRead) {
    const { data, error } = profileRead;
    if (error) throw new Error(`profiles 조회 실패: ${error.message}`);
    for (const p of (data ?? []) as {
      id: string;
      name: string | null;
      email: string | null;
    }[])
      profiles.set(p.id, { name: p.name, email: p.email });
  }

  const titles = new Map<string, string>();
  if (topicRead) {
    const { data, error } = topicRead;
    if (error) throw new Error(`inquiry_topics 조회 실패: ${error.message}`);
    for (const t of (data ?? []) as { id: string; detail: unknown }[]) {
      const title = (t.detail as { title?: unknown } | null)?.title;
      if (typeof title === "string") titles.set(t.id, title);
    }
  }

  return rows.map((r) =>
    toSessionListItem(
      r,
      profiles.get(r.profile_id),
      r.selected_topic_id ? (titles.get(r.selected_topic_id) ?? null) : null,
    ),
  );
}
