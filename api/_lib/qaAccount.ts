// QA 계정 보호 공통 모듈.
//
// 운영 DB(스쿨멘토)에는 QA 점검용 계정이 있고 public.qa_accounts 에 올라 있다. 서버 라우트는 service_role 이라
// DB 트리거(fn_block_qa_admin_write)가 닿지 않으므로, 실제 운영에 닿는 일은 라우트가 이 모듈로 직접 막는다.
// 위닝 DB 에서는 qa_accounts 가 비어 있어 isQaAccount 가 항상 false 이고 동작은 달라지지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { type ErrorShape, sendError } from "./httpResponse.js";
import { getBearerToken } from "./serviceAccess.js";

export const QA_ACCOUNT_MESSAGE = "QA 계정이라 이 기능은 작동하지 않아요.";
/** QA 본사 관리자의 쓰기 요청. */
export const QA_ACCOUNT_READ_ONLY_CODE = "QA_ACCOUNT_READ_ONLY";
/** QA 일반 계정이 실제 사람, 실제 운영으로 이어지는 일을 시도함. */
export const QA_ACCOUNT_RESTRICTED_CODE = "QA_ACCOUNT_RESTRICTED";

export type QaBlockCode =
  | typeof QA_ACCOUNT_READ_ONLY_CODE
  | typeof QA_ACCOUNT_RESTRICTED_CODE;

/** 라우트가 던지면 defineHandler 가 403 으로 바꿔 응답한다. */
export class QaBlockedError extends Error {
  constructor(readonly code: QaBlockCode) {
    super(QA_ACCOUNT_MESSAGE);
  }
}

/** 조회 자체가 실패하면 QA 아님으로 오인하지 않도록 예외를 던진다. */
export async function isQaAccount(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("qa_accounts")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error("qa account lookup failed");
  return Boolean(data);
}

/** 읽기 메서드만 QA 관리자에게 열려 있다. method 를 모르면 쓰기로 본다. */
export function isReadMethod(method: string | undefined): boolean {
  return method === "GET" || method === "HEAD";
}

/** 관리자임이 확인된 계정이 QA 이면 쓰기를 막는다. 권한 판정 직후에 부른다. */
export async function assertQaAdminMayWrite(
  supabaseAdmin: SupabaseClient,
  adminId: string,
): Promise<void> {
  if (await isQaAccount(supabaseAdmin, adminId)) {
    throw new QaBlockedError(QA_ACCOUNT_READ_ONLY_CODE);
  }
}

/** 일반 계정이 QA 이면 막는다. */
export async function assertNotQaAccount(
  supabaseAdmin: SupabaseClient,
  profileId: string,
): Promise<void> {
  if (await isQaAccount(supabaseAdmin, profileId)) {
    throw new QaBlockedError(QA_ACCOUNT_RESTRICTED_CODE);
  }
}

/** 403 응답. 어떤 에러 바디 형태든 최상위에 code 와 detail 을 함께 싣는다. */
export function sendQaBlocked(
  res: VercelResponse,
  shape: ErrorShape,
  code: string,
): void {
  sendError(res, shape, 403, QA_ACCOUNT_MESSAGE, code, {
    code,
    detail: QA_ACCOUNT_MESSAGE,
  });
}

/**
 * 로그인 없이도 쓰는 엔드포인트용. 토큰이 있고 QA 계정이면 막는다.
 * 토큰이 없거나 무효이면 익명으로 보고 통과시킨다(그 엔드포인트의 원래 동작).
 */
export async function assertNotQaRequester(
  supabaseAdmin: SupabaseClient,
  req: { headers: Record<string, string | string[] | undefined> },
): Promise<void> {
  const token = getBearerToken(req as { headers: Record<string, string> });
  if (!token) return;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return;
  await assertNotQaAccount(supabaseAdmin, data.user.id);
}
