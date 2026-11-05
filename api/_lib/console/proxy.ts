// 본사 대행 라우트(start, end)가 함께 쓰는 권한 판정.
// 판정은 DB 함수 fn_admin_effective_permissions 에 맡긴다(화면과 같은 술어, admin/send-message.ts 와 같은 방식).
// 리소스 키 teacherConsoleProxy 는 data SQL(admin_resources)이 만든다.

import type { SupabaseClient } from "@supabase/supabase-js";

export const PROXY_RESOURCE_KEY = "teacherConsoleProxy";

/** 조회 자체가 실패하면 권한 없음으로 오인하지 않도록 예외를 던진다. */
export async function hasProxyEditPermission(
  admin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("fn_admin_effective_permissions", {
    p_profile_id: profileId,
  });
  if (error) throw new Error("admin permission lookup failed");
  return ((data ?? []) as { resource_key?: string; level?: string }[]).some(
    (row) => row.resource_key === PROXY_RESOURCE_KEY && row.level === "edit",
  );
}
