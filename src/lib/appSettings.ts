// app_settings(key text, value jsonb) 공용 리더 — admissionSettings.ts와 같은
// 테이블을 쓰지만 그쪽은 "연도" 전용(admission_active_year, 실패 시 상수
// 폴백)이라 범용 boolean 조회는 여기 별도로 둔다. 이 파일은 admissionSettings.ts를
// 건드리지 않는다.
//
// 이 파일도 supabaseClient를 인자로 받는다(admissionSettings.ts와 동일 원칙) —
// 호출부가 이미 갖고 있는 client를 그대로 넘긴다.

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "app_settings";

function toBoolOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * app_settings에서 boolean 값을 조회한다. 행이 없거나, 조회 자체가 실패하거나,
 * 값이 boolean(또는 "true"/"false" 문자열)으로 해석되지 않으면 null을 돌려준다
 * — admissionSettings.ts의 연도 조회와 달리 여기서는 폴백 상수를 두지 않는다
 * (호출부가 "미확인은 차단"으로 해석해야 하는 게이트 값이라, 조용히 어느 한쪽으로
 * 접으면 안 된다).
 */
export async function getAppSettingBool(
  supabaseClient: SupabaseClient,
  key: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return toBoolOrNull(data.value);
  } catch {
    return null;
  }
}
