// 교사 관리 라우트(상태, 이름, 삭제, 담당 학급)가 함께 쓰는 범위 확인과 Auth 동기화.
// DB 가 기준이고 Auth 는 커밋 뒤에 따라간다. Auth 호출이 실패해도 DB 는 되돌리지 않으며, 같은 요청을 다시 보내 마무리한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";
import { type ConsoleAuditCtx, writeConsoleAuditLog } from "./audit.js";
import {
  generateTempPassword,
  hashTempPassword,
  RpcError,
  readIssueDedupeKey,
  sendTeacherDbError,
  TEACHERS_RESOURCE_KEY,
} from "./teacherAccounts.js";

export interface ScopedTeacher {
  id: string;
  profileId: string | null;
  deleted: boolean;
}

/**
 * 모든 id 가 이 기관의 교사일 때만 돌려준다. 하나라도 없거나 다른 기관이면 null 이라
 * 호출부가 404 로 존재 여부를 숨긴다. 삭제된 교사는 allowDeleted 일 때만 인정한다(삭제 재시도).
 */
export async function loadTeachersInScope(
  admin: SupabaseClient,
  tenantId: string,
  ids: string[],
  options: { allowDeleted?: boolean } = {},
): Promise<ScopedTeacher[] | null> {
  const { data, error } = await admin
    .from("teachers")
    .select("id, tenant_id, profile_id, deleted_at")
    .in("id", ids);
  if (error) throw new RpcError("teacher read", error.code);

  const rows = (data ?? []) as {
    id: string;
    tenant_id: string;
    profile_id: string | null;
    deleted_at: string | null;
  }[];
  const found = new Map(rows.map((row) => [row.id, row]));
  const scoped: ScopedTeacher[] = [];
  for (const id of ids) {
    const row = found.get(id);
    if (!row || row.tenant_id !== tenantId) return null;
    if (row.deleted_at && !options.allowDeleted) return null;
    scoped.push({
      id,
      profileId: row.profile_id,
      deleted: row.deleted_at !== null,
    });
  }
  return scoped;
}

// 약 100년. Supabase 문서의 영구 정지 예시와 같다.
const BAN_DURATION = "876000h";

/** Auth 사용자를 정지하거나(inactive) 해제한다(active). 실패하면 예외. */
export async function setAuthBan(
  admin: SupabaseClient,
  profileId: string,
  status: "active" | "inactive",
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: status === "inactive" ? BAN_DURATION : "none",
  });
  if (error) throw new AuthSyncError("ban");
}

/** Auth 사용자를 지운다. 이미 없으면(재시도) 성공으로 본다. 실패하면 예외. */
export async function deleteAuthUser(
  admin: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error && error.code !== "user_not_found") {
    throw new AuthSyncError("delete");
  }
}

/** DB 는 이미 커밋됐지만 Auth 쪽 반영이 끝나지 않았다. 같은 요청을 다시 보내면 마무리된다. */
export class AuthSyncError extends Error {
  constructor(operation: string) {
    super(`auth ${operation} sync failed`);
  }
}

/** 교사 관리 라우트의 예상된 실패(DB 규칙 위반, Auth 동기화 실패)를 응답으로 바꾼다. 그 밖의 에러는 false. */
export function sendTeacherError(res: VercelResponse, error: unknown): boolean {
  if (error instanceof AuthSyncError) {
    sendError(
      res,
      "coded",
      502,
      "변경은 저장됐지만 로그인 계정 반영을 마치지 못했습니다. 같은 요청을 다시 보내 주세요.",
      "AUTH_SYNC_FAILED",
    );
    return true;
  }
  return sendTeacherDbError(res, error);
}

export type ReissueResult =
  | { status: "not_found" | "no_account" | "password_set" | "send_not_failed" }
  | { status: "reissued"; tempPassword: string };

/**
 * 비밀번호 설정 전 계정의 임시 비밀번호를 다시 만든다(사 #148). 마지막 발송이 실패한 경우에만 허용한다.
 * 순서: 새 해시 저장(DB) -> 감사 로그 -> Auth 비밀번호 교체. Auth 가 바뀌기 전까지 옛 임시 비밀번호가 남으므로
 * 실패(AuthSyncError)하면 같은 요청을 다시 보낸다. 발송 상태는 alimtalk_send_logs 의 열쇠(teacherIssue:교사id:)로 읽는다.
 */
export async function reissueTeacherAccount(
  ctx: ConsoleAuditCtx,
  teacherId: string,
): Promise<ReissueResult> {
  const admin = ctx.supabaseAdmin;
  const { data: teacher, error } = await admin
    .from("teachers")
    .select("tenant_id, login_id, profile_id, password_set_at, deleted_at")
    .eq("id", teacherId)
    .maybeSingle();
  if (error) throw new RpcError("teacher read", error.code);
  if (
    !teacher ||
    teacher.deleted_at ||
    teacher.tenant_id !== ctx.console.tenantId
  ) {
    return { status: "not_found" };
  }
  if (!teacher.profile_id || !teacher.login_id) return { status: "no_account" };
  if (teacher.password_set_at) return { status: "password_set" };

  const { data: logs, error: logError } = await admin
    .from("alimtalk_send_logs")
    .select("status")
    .like("dedupe_key", `teacherIssue:${teacherId}:%`)
    .order("id", { ascending: false })
    .limit(1);
  if (logError) throw new RpcError("alimtalk log read", logError.code);
  if ((logs as { status: string }[] | null)?.[0]?.status === "sent") {
    return { status: "send_not_failed" };
  }

  const tempPassword = generateTempPassword();
  const { error: attachError } = await admin.rpc("fn_teacher_attach_account", {
    p_teacher_id: teacherId,
    p_profile_id: teacher.profile_id,
    p_login_id: teacher.login_id,
    p_temp_hash: await hashTempPassword(tempPassword),
  });
  if (attachError)
    throw new RpcError("fn_teacher_attach_account", attachError.code);

  await writeConsoleAuditLog(ctx, {
    action: "account_reissue",
    resourceKey: TEACHERS_RESOURCE_KEY,
    targetId: teacherId,
    meta: {
      loginId: teacher.login_id,
      sendDedupeKey: await readIssueDedupeKey(admin, teacherId),
    },
  });

  const { error: authError } = await admin.auth.admin.updateUserById(
    teacher.profile_id,
    { password: tempPassword },
  );
  if (authError) throw new AuthSyncError("password");
  return { status: "reissued", tempPassword };
}
