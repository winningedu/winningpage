// 서비스이용횟수조정 화면과 조정 응답이 쓰는 6개 서비스 이용권 요약.
// 총/사용은 fn_program_access_grants_summary(부여 원장 + 소비 원장 재계산)가 정본이다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_CREDIT_PROGRAMS } from "./programs.js";

export type ServiceCreditRow = {
  programKey: string;
  label: string;
  periodBased: boolean;
  liveCount: number;
  /** null = 회차 무제한 이용권(기간형). 이용권이 없으면 0. */
  quotaTotal: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  expiresAt: string | null;
};

type SummaryRpcRow = {
  live_count: number;
  quota_total: number | null;
  quota_used: number;
  expires_at: string | null;
  unlimited_period: boolean;
};

export async function readServiceCredit(
  db: SupabaseClient,
  profileId: string,
  programKey: string,
): Promise<ServiceCreditRow> {
  const program = SERVICE_CREDIT_PROGRAMS.find(
    (p) => p.programKey === programKey,
  );
  if (!program) throw new Error(`알 수 없는 programKey: ${programKey}`);

  const { data, error } = await db.rpc("fn_program_access_grants_summary", {
    p_profile_id: profileId,
    p_program_key: programKey,
  });
  if (error)
    throw new Error(
      `fn_program_access_grants_summary(${programKey}) 실패: ${error.message}`,
    );
  const row = (Array.isArray(data) ? data[0] : data) as SummaryRpcRow | null;
  const liveCount = row?.live_count ?? 0;
  const quotaUsed = row?.quota_used ?? 0;
  // 살아있는 이용권이 없으면 합계는 0 이다. null 은 회차 무제한 이용권만 뜻한다.
  const quotaTotal = liveCount === 0 ? 0 : (row?.quota_total ?? null);

  return {
    programKey,
    label: program.label,
    periodBased: program.periodBased,
    liveCount,
    quotaTotal,
    quotaUsed,
    quotaRemaining:
      quotaTotal === null ? null : Math.max(quotaTotal - quotaUsed, 0),
    expiresAt: row?.unlimited_period ? null : (row?.expires_at ?? null),
  };
}

export function readServiceCredits(
  db: SupabaseClient,
  profileId: string,
): Promise<ServiceCreditRow[]> {
  return Promise.all(
    SERVICE_CREDIT_PROGRAMS.map((p) =>
      readServiceCredit(db, profileId, p.programKey),
    ),
  );
}
