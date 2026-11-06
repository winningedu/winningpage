// 수행평가 주제 추천의 차감과 한도 선차단에서 스쿨멘토만 갈라지는 부분.
// 위닝은 consume_performance_credit RPC 와 program_access 를 그대로 쓰고 여기서 아무것도 읽지 않는다.
// 스쿨멘토는 기관 한도에서 (performance_session, sessionId) 당 한 번만 센다(원장 없음).

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchoolmentorSite } from "../site.js";
import {
  checkTenantStart,
  consumeTenantUsage,
  readTenantQuota,
  readTenantUsage,
  type TenantDenyReason,
} from "../tenantUsage.js";

const PROGRAM_KEY = "suhaeng";

/**
 * consume_performance_credit 과 같은 `{ data, error }` 모양을 돌려준다. data.status 어휘도 같고
 * (charged, already_charged, quota_exhausted, no_entitlement, entitlement_expired)
 * 스쿨멘토만 거부 사유 tenantReason 이 더 있다.
 */
export async function consumePerformanceCredit(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  reason: string,
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (!isSchoolmentorSite()) {
    return db.rpc("consume_performance_credit", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_reason: reason,
    });
  }
  try {
    const mapped = await consumeTenantUsage(db, userId, PROGRAM_KEY, {
      kind: "performance_session",
      id: sessionId,
    });
    const quota = readTenantQuota(
      await readTenantUsage(db, userId, PROGRAM_KEY),
    );
    return {
      data: {
        ...mapped,
        quota_remaining: quota.quotaRemaining,
        plan_ends_at: quota.planEndsAt,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: { message: String((e as Error).message) } };
  }
}

/**
 * 스쿨멘토에서 새 세션이 한도에 걸렸는지 모델 호출 전에 본다. 이미 센 세션은 한도여도 이어서 한다.
 * 막히면 사유와 다시 열리는 날, 아니면 null. 진입 게이트 거부(catch_all 등)는 앞 게이트 몫이라 null 이다.
 */
export async function performanceCapDenial(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<{
  tenantReason: TenantDenyReason;
  planEndsAt: string | null;
} | null> {
  if (!isSchoolmentorSite()) return null;
  const denied = await checkTenantStart(db, userId, PROGRAM_KEY, {
    kind: "performance_session",
    id: sessionId,
  });
  if (denied !== "month_cap" && denied !== "term_cap") return null;
  const quota = readTenantQuota(await readTenantUsage(db, userId, PROGRAM_KEY));
  return { tenantReason: denied, planEndsAt: quota.planEndsAt };
}
