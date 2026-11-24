// 세션 목록과 상세가 같이 쓰는 프로필 이름, 이메일 조회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileSummary } from "./list.js";

export async function loadProfiles(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, ProfileSummary>> {
  const profiles = new Map<string, ProfileSummary>();
  if (ids.length === 0) return profiles;
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
  return profiles;
}
