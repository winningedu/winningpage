// 콘솔 감사 로그. 변경과 열람을 admin_access_logs 에 남긴다.
//
// 적재에 실패하면 예외를 던진다. 호출부(쓰기 라우트)는 이를 잡지 않으므로 defineHandler 가
// 500 을 내고, 남기지 못한 변경은 성공으로 끝나지 않는다. 임시 비밀번호는 meta 에 넣지 않는다.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ConsoleActor, ConsoleActorKind } from "./actor.js";

export type ConsoleAuditAction =
  | "view"
  | "update"
  | "export"
  | "account_issue"
  | "account_reissue"
  | "account_status"
  | "account_delete"
  | "password_set"
  | "teacher_import"
  | "proxy_start"
  | "proxy_end"
  | "settings_change";

export interface ConsoleAuditEntry {
  action: ConsoleAuditAction;
  resourceKey: string;
  targetId?: string | undefined;
  rowCount?: number | undefined;
  reason?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

export interface ConsoleAuditCtx {
  supabaseAdmin: SupabaseClient;
  userId?: string | undefined;
  user?: User | undefined;
  console: ConsoleActor;
}

const ACTOR_KIND: Record<ConsoleActorKind, string> = {
  homeroom: "teacher",
  school_admin: "school_admin",
  hq_proxy: "hq_proxy",
};

// 비밀번호 키는 값이 무엇이든 중첩까지 모두 버린다.
function scrubPasswords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPasswords);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password/i.test(key))
        .map(([key, v]) => [key, scrubPasswords(v)]),
    );
  }
  return value;
}

export async function writeConsoleAuditLog(
  ctx: ConsoleAuditCtx,
  entry: ConsoleAuditEntry,
): Promise<void> {
  const actor = ctx.console;
  const { error } = await ctx.supabaseAdmin.from("admin_access_logs").insert({
    profile_id: ctx.userId ?? null,
    actor_email: actor.kind === "hq_proxy" ? (ctx.user?.email ?? null) : null,
    tenant_id: actor.tenantId,
    actor_kind: ACTOR_KIND[actor.kind],
    actor_login_id: actor.loginId,
    teacher_id: actor.teacherId,
    proxy_session_id: actor.proxySessionId,
    action: entry.action,
    resource_key: entry.resourceKey,
    reason: entry.reason ?? null,
    row_count: entry.rowCount ?? null,
    target_id: entry.targetId ?? null,
    meta: scrubPasswords(entry.meta ?? {}) as Record<string, never>,
  });
  if (error) throw new Error("console audit log write failed");
}
