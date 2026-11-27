import { queryOptions } from "@tanstack/react-query";
import { site } from "@/config/site";
import { adminPermissionsSchema } from "../../shared/admin-me/contract.js";
import type { AdminLevel } from "../../shared/admin-permission/menu.js";
import {
  isSuperOnlySection,
  permissionKeyFor,
} from "../../shared/admin-permission/sections.js";
import { api } from "./http/client";

// ---------------------------------------------------------------------------
// 어드민 메뉴별 권한 판정 — 20260822000010_admin_permissions 의 화면 쪽 소비자.
// 권한 조회는 브라우저가 rpc 를 부르지 않고 GET /api/admin/me/permissions 를 쓴다.
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

export type { AdminLevel };

/** 메뉴 키 → 최종 권한. 여기 **없는 키는 접근 불가**다(규칙 3, default deny). */
export type AdminPermissionMap = Map<string, AdminLevel>;

const PERMISSIONS_STALE_MS = 15_000;

/**
 * GET /api/admin/me/permissions: 내 최종 권한 맵과 최고 관리자 여부.
 *
 * 라우트 가드와 사이드바가 같은 키를 쓰므로 15초 안에는 요청 하나를 나눠 쓴다
 * (예전 routeMiddlewareCache TTL 과 같은 창). 못 읽으면 호출부가 빈 맵으로 닫는다(fail-closed).
 * retry 를 끄는 이유: 가드가 403 이나 오류를 곧바로 받아야 하고, 재시도로 이동이 늦어지면 안 된다.
 */
export function adminPermissionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["admin", "me", "permissions", userId] as const,
    queryFn: async ({
      signal,
    }): Promise<{ permissions: AdminPermissionMap; isSuper: boolean }> => {
      const body = await api
        .get("admin/me/permissions", { signal })
        .json(adminPermissionsSchema);
      return {
        permissions: new Map(Object.entries(body.permissions)),
        isSuper: body.isSuper,
      };
    },
    staleTime: PERMISSIONS_STALE_MS,
    retry: false,
  });
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
  if (isSuperOnlySection(sectionKey)) return isSuperAdmin;
  const key = permissionKeyFor(sectionKey, () => site.features.hqTenantAdmin);
  return key !== null && permissions.has(key);
}

/**
 * 이 메뉴에서 등록, 수정, 삭제, 저장을 보여도 되나. 서버(R2)는 view 권한의 쓰기를 403 으로 막으므로
 * 화면도 같은 기준으로 쓰기 버튼을 감춘다. 접근 판정과 같은 순서로 거르고, 맵에 없거나 view 면 닫는다.
 */
export function canEditSection(
  permissions: AdminPermissionMap,
  isSuperAdmin: boolean,
  sectionKey: string,
): boolean {
  if (isSuperOnlySection(sectionKey)) return isSuperAdmin;
  const key = permissionKeyFor(sectionKey, () => site.features.hqTenantAdmin);
  return key !== null && permissions.get(key) === "edit";
}
