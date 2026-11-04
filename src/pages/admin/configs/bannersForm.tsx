import { supabase } from "@/lib/supabase";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

// ── 배너 관리(banners, home_side_banners) 공통: 노출 대상 선택지 + 저장 변환 ──

// 노출 대상 select 선택지. tenants 전체를 이름순으로 불러온다(CouponAdmin 소속 드롭다운과 같은 조회).
export async function loadTenantOptions(): Promise<FieldOption[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return (data || []).map((tenant) => ({
    value: tenant.id,
    label: tenant.name,
  }));
}

const NULLABLE_BANNER_KEYS = ["tenant_id", "start_date", "end_date"] as const;

// 비운 노출 대상/기간은 빈 문자열이 아니라 null 로 저장한다(uuid, date 컬럼은 ""를 받지 못한다).
export function bannerFormToPayload(
  form: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...form };
  for (const key of NULLABLE_BANNER_KEYS) {
    if (key in payload && !payload[key]) payload[key] = null;
  }
  return payload;
}
