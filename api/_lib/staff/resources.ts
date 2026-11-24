// 관리자 메뉴 목록(admin_resources). 관리자 화면과 권한 묶음 화면이 같은 목록을 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";

/** 켜진 메뉴를 정렬 순서대로 읽는다. 오류는 호출부가 처리한다. */
export function readResources(admin: SupabaseClient) {
  return admin
    .from("admin_resources")
    .select("key, group_title, label, sort_order")
    .eq("is_active", true)
    .order("sort_order");
}
