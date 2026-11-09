import { site } from "@/config/site";
import { getCached, setCached } from "./routeMiddlewareCache";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// 어드민 메뉴별 권한 판정 — 20260822000010_admin_permissions 의 화면 쪽 소비자.
//
// 왜 필요한가
//   권한 테이블·판정 함수는 2026-08-22 에 만들어졌는데, 화면과 라우트가 그걸
//   **하나도 읽지 않고 있었다**(2026-08-23 실측). 사이드바는 MENU_GROUPS 를 무조건
//   전부 그렸고 requireAdminMiddleware 는 role='admin' 만 봤다. 그래서 「접근 불가」로
//   설정해도 메뉴가 그대로 보이고 들어가졌다.
//
// ⚠️ 이건 **화면 차단**이다. 진짜 차단은 RLS 다.
//   지금 fn_admin_can 을 쓰는 정책은 program_access·alimtalk_send_logs 둘뿐이고
//   나머지 테이블은 여전히 is_admin() 이다 — 즉 여기서 메뉴를 숨겨도 REST 를 직접
//   치면 데이터는 읽힌다. RLS 술어를 fn_admin_can 으로 옮기는 게 2단계이고,
//   20260822000010 상단 주석의 "다리"가 그 이야기다.
//   그 전까지 이 파일은 "실수로 들어가는 것"만 막는다고 이해할 것.
// ---------------------------------------------------------------------------

export type AdminLevel = "view" | "edit";

/** 메뉴 키 → 최종 권한. 여기 **없는 키는 접근 불가**다(규칙 3, default deny). */
export type AdminPermissionMap = Map<string, AdminLevel>;

/**
 * 최고 관리자 전용 메뉴.
 *
 * 시드상으로도 실무 관리자 묶음에는 이 그룹 항목이 하나도 없어(default deny) 이미
 * 막히지만, **누군가 개별 권한으로 이 키를 켜주면 뚫린다.** 직원 등록·권한 조정은
 * 되돌리기 어려운 작업이라 묶음 설정과 무관하게 여기서 한 겹 더 잠근다
 * (사용자 지시 2026-08-23).
 */
const SUPER_ONLY_SECTIONS = new Set(["adminMembers", "adminRoles"]);

/**
 * 별도 권한 행 없이 다른 메뉴 키의 권한을 같이 쓰는 메뉴(결정 102.8). 스쿨멘토(hqTenantAdmin)에만 있는 화면이라
 * 사이트 플래그가 꺼져 있으면 권한이 있어도 열지 않는다. 서버 API 도 같은 tenants 권한을 본다.
 */
const SECTION_PERMISSION_ALIAS: Record<string, string> = {
  memberPurge: "tenants",
  memberPurgeLogs: "tenants",
};

const PERMISSIONS_CACHE_KIND = "admin-permissions";
const SUPER_CACHE_KIND = "admin-is-super";

/** 내 최종 권한 목록. 실패하면 빈 맵을 준다 — 못 읽었으면 열지 않는다(fail-closed). */
export async function fetchAdminPermissions(
  userId: string,
): Promise<AdminPermissionMap> {
  const cached = getCached<AdminPermissionMap>(userId, PERMISSIONS_CACHE_KIND);
  if (cached) return cached;

  const { data, error } = await supabase.rpc("fn_admin_effective_permissions", {
    p_profile_id: userId,
  });

  const map: AdminPermissionMap = new Map();

  if (error) {
    console.error("어드민 권한 조회 실패:", error);
    // 캐시에 넣지 않는다 — 일시 오류를 15초 동안 굳히면 그동안 메뉴가 통째로
    // 사라진 것처럼 보인다. 다음 이동에서 다시 시도하게 둔다.
    return map;
  }

  for (const row of data || []) {
    const key = String(row.resource_key || "");
    const level = String(row.level || "");
    // 'none' 은 판정 함수가 이미 제외하지만(규칙 1: deny-wins), 방어적으로 거른다.
    if (key && (level === "view" || level === "edit")) {
      map.set(key, level);
    }
  }

  setCached(userId, PERMISSIONS_CACHE_KIND, map);
  return map;
}

/** 최고 관리자인지. 실패하면 false — 못 읽었으면 최고 권한으로 치지 않는다. */
export async function fetchIsSuperAdmin(userId: string): Promise<boolean> {
  const cached = getCached<boolean>(userId, SUPER_CACHE_KIND);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase.rpc("fn_is_super_admin", {
    p_profile_id: userId,
  });

  if (error) {
    console.error("최고 관리자 판정 실패:", error);
    return false;
  }

  const isSuper = data === true;
  setCached(userId, SUPER_CACHE_KIND, isSuper);
  return isSuper;
}

/**
 * 이 메뉴에 들어갈 수 있나.
 *
 * 순서가 중요하다 — 최고 관리자 전용 메뉴를 **먼저** 거른다. 최고 관리자는 판정
 * 함수가 전 메뉴 edit 으로 단락시키므로 권한 맵만 보면 둘을 구분할 수 없다.
 */
export function canAccessSection(
  permissions: AdminPermissionMap,
  isSuperAdmin: boolean,
  sectionKey: string,
): boolean {
  if (SUPER_ONLY_SECTIONS.has(sectionKey)) return isSuperAdmin;
  const alias = SECTION_PERMISSION_ALIAS[sectionKey];
  if (alias) return site.features.hqTenantAdmin && permissions.has(alias);
  return permissions.has(sectionKey);
}
