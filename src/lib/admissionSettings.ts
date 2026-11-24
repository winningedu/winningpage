// 대입모집요강 전역 설정 조회/저장(app_settings, sql/49 — 구 sql/46,
// origin/dev의 46_profiles_role_hardening.sql과 번호가 겹쳐 2026-08-06
// 재번호했다. dev 적용 상태는 그대로다).
//
// 공개 노출 연도는 관리자가 명시적으로 지정한다(최신 연도 자동 노출
// 금지 — 준비 중인 데이터가 조기 노출되는 것을 막기 위함, 2026-08-06
// "연도별 관리" 도입 결정). AdmissionGuidelines.jsx:86의
// ACTIVE_ADMISSION_YEAR 하드코딩을 이 값으로 대체한다.
//
// 이 파일은 supabaseClient를 인자로 받는다(자체적으로 client를 만들지
// 않는다) — 호출부(어드민 UI/공개 페이지)가 이미 갖고 있는 client를
// 그대로 넘기면 된다. DB 접근은 이 두 함수를 통해서만 이뤄진다.

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "app_settings";
const ADMISSION_ACTIVE_YEAR_KEY = "admission_active_year";
const DEFAULT_ADMISSION_ACTIVE_YEAR = 2027;

/**
 * 현재 공개 노출 중인 모집요강 연도를 조회한다. 설정값이 없거나(최초
 * 배포 전, 마이그레이션 미적용 등) 조회 자체가 실패하면 조용히
 * DEFAULT_ADMISSION_ACTIVE_YEAR로 폴백한다 — 이 함수가 던지면 공개
 * 페이지 전체가 죽으므로, 설정 조회 실패가 노출 중단으로 이어지면
 * 안 된다.
 */
export async function getAdmissionActiveYear(
  supabaseClient: SupabaseClient,
): Promise<number> {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select("value")
      .eq("key", ADMISSION_ACTIVE_YEAR_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_ADMISSION_ACTIVE_YEAR;
    const year = Number(data.value);
    return Number.isFinite(year) && year > 0
      ? year
      : DEFAULT_ADMISSION_ACTIVE_YEAR;
  } catch {
    return DEFAULT_ADMISSION_ACTIVE_YEAR;
  }
}
