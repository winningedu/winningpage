// 소속코드 조회(가입 전, 계정 없음). DB 함수가 IP 당 1시간 10회 오답 제한(WC068)을 센다.
// 소속코드 조회 라우트와 가입 확정 라우트가 같이 쓴다(가입 확정은 클라이언트가 보낸 기관 id 를 믿지 않고 코드로 다시 찾는다).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignupTenant {
  id: string;
  name: string;
  orgType: string;
}

export type TenantLookupResult =
  | { ok: true; tenant: SignupTenant }
  | { ok: false; reason: "not_found" | "rate_limited" };

export async function lookupSignupTenant(
  admin: SupabaseClient,
  code: string,
  ip: string,
): Promise<TenantLookupResult> {
  const { data, error } = await admin.rpc("fn_signup_tenant_lookup", {
    p_code: code,
    p_ip: ip,
  });
  if (error?.code === "WC068") return { ok: false, reason: "rate_limited" };
  if (error) throw error;
  const row = (
    data as { id: string; name: string; org_type: string }[] | null
  )?.[0];
  if (!row) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    tenant: { id: row.id, name: row.name, orgType: row.org_type },
  };
}
