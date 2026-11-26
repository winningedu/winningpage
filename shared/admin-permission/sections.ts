/**
 * 어드민 메뉴 권한 위에 얹는 규칙 (순수 함수, React 없음)
 *
 * 화면(src/lib/adminPermissions.ts)과 서버(api/_lib/adminPermission.ts)가 같은 규칙을 쓰도록 shared/ 에 둔다.
 */

/**
 * 최고 관리자 전용 메뉴.
 *
 * 시드상으로도 실무 관리자 묶음에는 이 그룹 항목이 하나도 없어(default deny) 이미
 * 막히지만, 누군가 개별 권한으로 이 키를 켜주면 뚫린다. 직원 등록과 권한 조정은
 * 되돌리기 어려운 작업이라 묶음 설정과 무관하게 한 겹 더 잠근다(사용자 지시 2026-08-23).
 */
const SUPER_ONLY_SECTIONS = new Set(["adminMembers", "adminRoles"]);

/**
 * 별도 권한 행 없이 다른 메뉴 키의 권한을 같이 쓰는 메뉴(결정 102.8). hqTenantAdmin 사이트에만 있는
 * 화면이라 사이트 플래그가 꺼져 있으면 권한이 있어도 열지 않는다.
 */
const SECTION_PERMISSION_ALIAS: Record<string, string> = {
  memberPurge: "tenants",
  memberPurgeLogs: "tenants",
};

/** fn_is_super_admin 으로만 여는 메뉴인지. 최고 관리자는 권한 맵이 전부 edit 라 맵으로는 구분할 수 없다. */
export function isSuperOnlySection(sectionKey: string): boolean {
  return SUPER_ONLY_SECTIONS.has(sectionKey);
}

/**
 * 권한 맵에서 찾을 키. 별칭 메뉴인데 사이트 플래그가 꺼져 있으면 null(열지 않는다).
 * 플래그는 별칭 메뉴일 때만 읽는다(서버는 SITE env 가 있어야 읽을 수 있다).
 */
export function permissionKeyFor(
  sectionKey: string,
  hqTenantAdmin: () => boolean,
): string | null {
  const alias = SECTION_PERMISSION_ALIAS[sectionKey];
  if (!alias) return sectionKey;
  return hqTenantAdmin() ? alias : null;
}
