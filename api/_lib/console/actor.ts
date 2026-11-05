// 콘솔 요청의 행위자. fn_console_actor 가 돌려준 값을 핸들러가 쓰기 좋은 모양으로 담는다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConsoleActorKind = "homeroom" | "school_admin" | "hq_proxy";

export interface ConsoleActor {
  kind: ConsoleActorKind;
  tenantId: string;
  /** 본사 대행(hq_proxy)이면 null. */
  teacherId: string | null;
  /** 담당 학급. 학교 관리자와 대행은 기관 전체라 비어 있다. */
  classIds: string[];
  /** 본사 대행 세션일 때만 값이 있다. */
  proxySessionId: string | null;
  mustChangePassword: boolean;
  /** 교사 로그인 아이디. 본사 대행이면 null. */
  loginId: string | null;
}

interface ConsoleActorRow {
  kind: string;
  tenant_id: string | null;
  teacher_id: string | null;
  class_ids: string[] | null;
  proxy_session_id: string | null;
  must_change_password: boolean | null;
}

/**
 * fn_console_actor 는 항상 한 행을 돌려주고 kind 'none' 은 콘솔 권한 없음이다. 그때 null.
 * 조회 자체가 실패하면 권한 없음으로 오인하지 않도록 예외를 던진다.
 */
export async function resolveConsoleActor(
  admin: SupabaseClient,
  profileId: string,
): Promise<ConsoleActor | null> {
  const { data, error } = await admin.rpc("fn_console_actor", {
    p_profile_id: profileId,
  });
  const row = (data as ConsoleActorRow[] | null)?.[0];
  if (error || !row) throw new Error("console actor lookup failed");
  if (row.kind === "none") return null;
  if (!row.tenant_id) throw new Error("console actor has no tenant");

  let loginId: string | null = null;
  if (row.teacher_id) {
    const { data: teacher, error: teacherError } = await admin
      .from("teachers")
      .select("login_id")
      .eq("id", row.teacher_id)
      .maybeSingle();
    if (teacherError) throw new Error("console actor lookup failed");
    loginId = teacher?.login_id ?? null;
  }

  return {
    kind: row.kind as ConsoleActorKind,
    tenantId: row.tenant_id,
    teacherId: row.teacher_id,
    classIds: row.class_ids ?? [],
    proxySessionId: row.proxy_session_id,
    mustChangePassword: row.must_change_password ?? false,
    loginId,
  };
}
