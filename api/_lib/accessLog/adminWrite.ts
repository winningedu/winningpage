// 관리자 쓰기 요청의 감사 행(admin_access_logs)을 만들고 적재한다. defineHandler 가 응답 뒤에 부른다.
// 쓰기가 서비스 롤로 나가 DB 트리거가 auth.uid() 를 못 보므로, 누가 어느 메뉴를 바꿨는지는 여기서 남긴다.
// 요청 본문, 응답 본문, 값은 싣지 않는다(개인정보가 섞일 수 있다).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { resolvePermissionKey } from "../adminPermission.js";
import { scheduleAfterResponse } from "../afterResponse.js";

export type AdminWriteAction = "create" | "update" | "delete" | "view";

export interface AdminWriteAuditInput {
  req: VercelRequest;
  statusCode: number;
  /** 토큰에서 확인한 관리자. 본문 값은 쓰지 않는다. */
  actor: { userId: string; email: string | null };
  /** 권한 판정에 요청한 메뉴 키(별칭 해석 전). */
  requestedKey: string;
  action?: AdminWriteAction;
}

const DEFAULT_ACTION: Record<string, AdminWriteAction> = {
  POST: "create",
  PATCH: "update",
  PUT: "update",
  DELETE: "delete",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 읽기 요청은 감사 대상이 아니다. */
export function isAuditableMethod(method: string | undefined): boolean {
  return method !== undefined && method in DEFAULT_ACTION;
}

function pathOf(req: VercelRequest): string {
  return req.url?.split("?")[0] ?? "";
}

// ?id= 쿼리만으로 대상이 정해지지 않게, 경로 조각에 실제로 있는 값만 대상 id 로 본다.
function pathParam(req: VercelRequest, name: string): string | null {
  const value = req.query?.[name];
  if (typeof value !== "string" || value === "") return null;
  const segments = pathOf(req)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  return segments.includes(value) ? value : null;
}

export function buildAdminWriteAuditRow(
  input: AdminWriteAuditInput,
): Record<string, unknown> {
  const { req, actor } = input;
  const method = req.method ?? "";
  const requestId = req.headers["x-vercel-id"];
  const meta: Record<string, unknown> = {
    route: pathOf(req),
    method,
    status: input.statusCode,
    requestId: typeof requestId === "string" ? requestId : null,
  };

  let targetId: string | null = null;
  for (const name of ["id", "profileId"]) {
    const value = pathParam(req, name);
    if (value === null) continue;
    if (UUID_PATTERN.test(value)) {
      targetId ??= value;
    } else {
      meta.targetId ??= value;
    }
  }

  return {
    profile_id: actor.userId,
    actor_email: actor.email,
    actor_kind: "hq",
    action: input.action ?? DEFAULT_ACTION[method],
    resource_key:
      resolvePermissionKey(input.requestedKey) ?? input.requestedKey,
    target_id: targetId,
    reason: null,
    row_count: null,
    meta,
  };
}

/** 응답을 보낸 뒤에 감사 행을 적재하도록 예약한다. */
export function scheduleAdminWriteAudit(
  admin: () => SupabaseClient,
  input: AdminWriteAuditInput,
): void {
  scheduleAfterResponse(() => writeAdminWriteAudit(admin, input));
}

/** 적재 실패는 응답을 바꾸지 않는다. 요청 id 한 줄만 남겨 나중에 찾게 한다. */
export async function writeAdminWriteAudit(
  admin: () => SupabaseClient,
  input: AdminWriteAuditInput,
): Promise<void> {
  try {
    const row = buildAdminWriteAuditRow(input);
    const { error } = await admin().from("admin_access_logs").insert(row);
    if (error) throw error;
  } catch {
    const requestId = input.req.headers["x-vercel-id"];
    console.error(
      "[admin-audit] 감사 로그 적재 실패",
      JSON.stringify({
        requestId: typeof requestId === "string" ? requestId : null,
        route: pathOf(input.req),
        method: input.req.method ?? null,
      }),
    );
  }
}
