// api/selfeval 핸들러가 함께 쓰는 응답과 이용권 보조. growth/survey.ts 의 fail, readEntitlement 와 같은 모양이다.

import type { VercelResponse } from "@vercel/node";
import type { Db } from "../growth/intake/collectDb.js";
import { sendError } from "../httpResponse.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  type QuotaSnapshot,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../serviceAccess.js";
import { isSchoolmentorSite } from "../site.js";
import {
  readTenantQuota,
  readTenantUsage,
  type TenantDenyReason,
  tenantReasonOf,
} from "../tenantUsage.js";

export function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

/** 진입 판정과 거부 사유. tenantReason 은 스쿨멘토에서만 채워진다. */
export async function readSelfevalAccess(
  db: Db,
  userId: string,
): Promise<{ allowed: boolean; tenantReason: TenantDenyReason | null }> {
  const config = SERVICE_CONFIGS.selfeval;
  if (!config) throw new Error("SERVICE_CONFIGS.selfeval 가 없습니다.");
  const { allowed, reason } = await hasPaidServiceAccess(db, userId, config);
  return { allowed, tenantReason: tenantReasonOf(reason) };
}

export async function hasSelfevalAccess(
  db: Db,
  userId: string,
): Promise<boolean> {
  return (await readSelfevalAccess(db, userId)).allowed;
}

/** 회차 정보. 안내용이라 못 읽어도 진입을 막지 않는다(growth/survey 와 같은 취급). */
export async function readSelfevalQuota(
  db: Db,
  userId: string,
): Promise<QuotaSnapshot & { capReason?: "month_cap" | "term_cap" | null }> {
  const config = SERVICE_CONFIGS.selfeval;
  if (!config) throw new Error("SERVICE_CONFIGS.selfeval 가 없습니다.");
  const empty = await readQuotaSnapshot(db, userId, null);
  // 스쿨멘토는 기관 한도에서 읽는다. capReason 은 남은 횟수가 0 일 때의 사유다.
  if (isSchoolmentorSite()) {
    try {
      return readTenantQuota(await readTenantUsage(db, userId, "selfeval"));
    } catch (quotaError) {
      console.error("selfeval 기관 quota 조회 실패(무시):", quotaError);
      return empty;
    }
  }
  try {
    return await readQuotaSnapshot(
      db,
      userId,
      await findProgramAccessRow(db, userId, config),
    );
  } catch (quotaError) {
    console.error("selfeval quota 조회 실패(무시):", quotaError);
    return empty;
  }
}
