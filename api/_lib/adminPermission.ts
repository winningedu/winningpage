// 어드민 메뉴 권한 서버 판정. defineHandler 의 permission 옵션이 부른다.
//
// 사용법(auth:"admin" 라우트에서만, 라우트 안에서 손으로 권한을 보지 않는다)
//   defineHandler({ auth: "admin", errorShape: "problem", permission: { key: "members" }, ... })
//   경로 파라미터가 메뉴 키면 함수로 준다: permission: { key: (req) => String(req.query.key ?? "") }
//   level 을 생략하면 GET, HEAD 는 view, 나머지 메서드는 edit 를 요구한다. 읽기 POST 처럼 다르게
//   요구할 때만 level 을 적는다.
//   거부는 403 FORBIDDEN, 조회 오류는 미처리 예외 500(problem 이면 INTERNAL_ERROR)이고 라우트의 errorShape 를 따른다.
//   조회는 관리자 판정(역할, QA 계정 쓰기 차단)과 함께 시작하지만 응답은 관리자 판정 결과가 앞선다.
//
// 판정은 화면과 같다: 최고 관리자 전용 메뉴는 fn_is_super_admin, 별칭 메뉴는 사이트 플래그,
// 나머지는 fn_admin_effective_permissions(shared/admin-permission/sections.ts 규칙 공유).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminLevel } from "../../shared/admin-permission/menu.js";
import {
  isSuperOnlySection,
  permissionKeyFor,
} from "../../shared/admin-permission/sections.js";
import { SITES } from "../../src/config/sites.js";
import { getSiteKey } from "./site.js";

export type { AdminLevel };

/** 메뉴 권한 없음. defineHandler 가 403 FORBIDDEN 으로 바꾼다. */
export class SectionPermissionDeniedError extends Error {
  constructor() {
    super("이 메뉴를 쓸 권한이 없습니다.");
    this.name = "SectionPermissionDeniedError";
  }
}

export interface EffectivePermission {
  resource_key?: string;
  level?: string;
}

/** 한 요청 안에서 fn_admin_effective_permissions 를 한 번만 부르게 하는 읽기. 실패도 그대로 한 번 기억한다. */
export type EffectivePermissionsRead = () => Promise<EffectivePermission[]>;

export function readEffectivePermissions(
  admin: SupabaseClient,
  profileId: string,
): EffectivePermissionsRead {
  let read: Promise<EffectivePermission[]> | undefined;
  return () => {
    read ??= (async () => {
      const { data, error } = await admin.rpc(
        "fn_admin_effective_permissions",
        {
          p_profile_id: profileId,
        },
      );
      if (error) throw new Error("admin permission lookup failed");
      return (data ?? []) as EffectivePermission[];
    })();
    return read;
  };
}

/** 권한이 없으면 SectionPermissionDeniedError, 조회 자체가 실패하면 일반 예외를 던진다(권한 없음으로 오인하지 않게). */
export async function assertSectionPermission(
  admin: SupabaseClient,
  profileId: string,
  sectionKey: string,
  level: AdminLevel,
  effective?: EffectivePermissionsRead,
): Promise<void> {
  if (
    !(await hasSectionPermission(
      admin,
      profileId,
      sectionKey,
      level,
      effective,
    ))
  ) {
    throw new SectionPermissionDeniedError();
  }
}

/**
 * 판정에 쓰는 권한 키. 최고 관리자 전용 메뉴는 키 그대로, 별칭 메뉴는 사이트 플래그에 따라 대상 키나 null 이다.
 * 감사 로그의 resource_key 도 같은 키를 쓴다.
 */
export function resolvePermissionKey(sectionKey: string): string | null {
  if (isSuperOnlySection(sectionKey)) return sectionKey;
  // SITE 가 비면 getSiteKey 가 던져 500 으로 닫힌다(별칭 메뉴에서만 읽는다).
  return permissionKeyFor(
    sectionKey,
    () => SITES[getSiteKey()].features.hqTenantAdmin,
  );
}

/** 메뉴 권한 여부만 돌려준다. assertSectionPermission 과 같은 규칙이고, 조회 실패는 던진다. effective 를 주면 그 읽기를 나눠 쓴다. */
export async function hasSectionPermission(
  admin: SupabaseClient,
  profileId: string,
  sectionKey: string,
  level: AdminLevel,
  effective: EffectivePermissionsRead = readEffectivePermissions(
    admin,
    profileId,
  ),
): Promise<boolean> {
  if (isSuperOnlySection(sectionKey)) {
    const { data, error } = await admin.rpc("fn_is_super_admin", {
      p_profile_id: profileId,
    });
    if (error) throw new Error("admin super lookup failed");
    return data === true;
  }

  const key = resolvePermissionKey(sectionKey);
  if (!key) return false;

  return (await effective()).some(
    (row) =>
      row.resource_key === key &&
      (row.level === "edit" || (level === "view" && row.level === "view")),
  );
}

/** 함께 시작한 메뉴 권한 판정. key 는 키 함수 결과(던지면 400), check 는 그 키의 권한 판정이다. */
export interface MenuCheck {
  key: Promise<string>;
  check: Promise<void>;
}

/**
 * 키를 정하고 그 키로 권한을 판정하는 일을 지금 시작한다. 관리자 판정이 실패하면 호출부는 둘 다 보지 않으므로
 * 처리되지 않은 거부로 남지 않게 붙여 둔다. permission 시간은 키가 정해진 뒤 판정에 든 시간만 잰다.
 */
export function startMenuCheck(
  resolveKey: () => string | Promise<string>,
  assert: (requestedKey: string) => Promise<void>,
  steps: { permission?: number },
): MenuCheck {
  const key = (async () => resolveKey())();
  const check = key.then(async (requestedKey) => {
    const permissionStart = performance.now();
    try {
      await assert(requestedKey);
    } finally {
      steps.permission = performance.now() - permissionStart;
    }
  });
  key.catch(() => {});
  check.catch(() => {});
  return { key, check };
}
