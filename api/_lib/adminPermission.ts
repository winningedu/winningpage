// 어드민 메뉴 권한 서버 판정. defineHandler 의 permission 옵션이 부른다.
//
// 사용법(auth:"admin" 라우트에서만, 라우트 안에서 손으로 권한을 보지 않는다)
//   defineHandler({ auth: "admin", errorShape: "problem", permission: { key: "members" }, ... })
//   경로 파라미터가 메뉴 키면 함수로 준다: permission: { key: (req) => String(req.query.key ?? "") }
//   level 을 생략하면 GET, HEAD 는 view, 나머지 메서드는 edit 를 요구한다. 읽기 POST 처럼 다르게
//   요구할 때만 level 을 적는다.
//   실패는 403 FORBIDDEN, 조회 오류는 500 INTERNAL_ERROR 이고 라우트의 errorShape 를 따른다.
//   QA 계정 쓰기 차단(resolveAdmin)이 이 판정보다 먼저 돈다.
//
// 판정은 화면과 같다: 최고 관리자 전용 메뉴는 fn_is_super_admin, 별칭 메뉴는 사이트 플래그,
// 나머지는 fn_admin_effective_permissions(src/lib/admin-permission/sections.ts 규칙 공유).

import type { SupabaseClient } from "@supabase/supabase-js";
import { SITES } from "../../src/config/sites.js";
import {
  isSuperOnlySection,
  permissionKeyFor,
} from "../../src/lib/admin-permission/sections.js";
import { getSiteKey } from "./site.js";

export type AdminLevel = "view" | "edit";

/** 조회 자체가 실패하면 권한 없음으로 오인하지 않도록 예외를 던진다. */
export async function hasSectionPermission(
  admin: SupabaseClient,
  profileId: string,
  sectionKey: string,
  level: AdminLevel,
): Promise<boolean> {
  if (isSuperOnlySection(sectionKey)) {
    const { data, error } = await admin.rpc("fn_is_super_admin", {
      p_profile_id: profileId,
    });
    if (error) throw new Error("admin super lookup failed");
    return data === true;
  }

  // SITE 가 비면 getSiteKey 가 던져 500 으로 닫힌다(별칭 메뉴에서만 읽는다).
  const key = permissionKeyFor(
    sectionKey,
    () => SITES[getSiteKey()].features.hqTenantAdmin,
  );
  if (!key) return false;

  const { data, error } = await admin.rpc("fn_admin_effective_permissions", {
    p_profile_id: profileId,
  });
  if (error) throw new Error("admin permission lookup failed");
  return ((data ?? []) as { resource_key?: string; level?: string }[]).some(
    (row) =>
      row.resource_key === key &&
      (row.level === "edit" || (level === "view" && row.level === "view")),
  );
}
