// 관리자 회차 목록과 상세가 같은 항목 모양을 쓰도록 행에 프로필 이름과 이메일을 붙이는 한 곳.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ProfileSummary,
  type ReportListItem,
  type ReportListRow,
  toReportListItem,
} from "./list.js";

export const REPORT_COLUMNS =
  "id, profile_id, status, current_step, track, issued_at, last_activity_at, ledger_id, ledger_reversed_at, step_state";

export async function toReportItems(
  db: SupabaseClient,
  rows: ReportListRow[],
): Promise<ReportListItem[]> {
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const profiles = new Map<string, ProfileSummary>();
  if (ids.length > 0) {
    const { data, error } = await db
      .from("profiles")
      .select("id, name, email")
      .in("id", ids);
    if (error) throw new Error(`profiles 조회 실패: ${error.message}`);
    for (const p of (data ?? []) as {
      id: string;
      name: string | null;
      email: string | null;
    }[])
      profiles.set(p.id, { name: p.name, email: p.email });
  }
  return rows.map((r) => toReportListItem(r, profiles.get(r.profile_id)));
}
