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

export function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

export async function hasSelfevalAccess(
  db: Db,
  userId: string,
): Promise<boolean> {
  const config = SERVICE_CONFIGS.selfeval;
  if (!config) throw new Error("SERVICE_CONFIGS.selfeval 가 없습니다.");
  const { allowed } = await hasPaidServiceAccess(db, userId, config);
  return allowed;
}

/** 회차 정보. 안내용이라 못 읽어도 진입을 막지 않는다(growth/survey 와 같은 취급). */
export async function readSelfevalQuota(
  db: Db,
  userId: string,
): Promise<QuotaSnapshot> {
  const config = SERVICE_CONFIGS.selfeval;
  if (!config) throw new Error("SERVICE_CONFIGS.selfeval 가 없습니다.");
  const empty = await readQuotaSnapshot(db, userId, null);
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
