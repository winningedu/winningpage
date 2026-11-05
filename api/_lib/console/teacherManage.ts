// 교사 관리 라우트(상태, 이름, 삭제, 담당 학급)가 함께 쓰는 범위 확인과 Auth 동기화.
// DB 가 기준이고 Auth 는 커밋 뒤에 따라간다. Auth 호출이 실패해도 DB 는 되돌리지 않으며, 같은 요청을 다시 보내 마무리한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { RpcError } from "./teacherAccounts.js";

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
  if (error) throw new RpcError("auth ban sync", undefined);
}
