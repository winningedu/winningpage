// 사용 이력과 발급 이력 행에 사용자 이름과 이메일을 붙인다.
// user_id 는 auth.users 를 가리켜 PostgREST 임베딩으로 profiles 를 끌어올 수 없어 따로 읽는다.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserSummary {
  name: string | null;
  email: string | null;
}

/**
 * 프로필을 읽지 못해도 행 자체는 살린다(사용자만 null, 경고를 남긴다).
 * 게스트 결제는 user_id 가 null 이라 항상 user 가 null 이다.
 */
export async function attachUsers<T extends { user_id: string | null }>(
  admin: SupabaseClient,
  rows: T[],
): Promise<(T & { user: UserSummary | null })[]> {
  const userIds = [
    ...new Set(rows.map((row) => row.user_id).filter((id) => id !== null)),
  ];
  const byId = new Map<string, UserSummary>();

  if (userIds.length > 0) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);
    if (error) {
      console.warn("사용자 조회 실패:", error.message);
    } else {
      for (const profile of data ?? []) {
        byId.set(profile.id, { name: profile.name, email: profile.email });
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    user: row.user_id ? (byId.get(row.user_id) ?? null) : null,
  }));
}
