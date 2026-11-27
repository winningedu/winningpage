// /api/admin/roles 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/roles", roles) 로 붙인다.
// 하위 경로(/:id 와 그 아래)는 roles-detail.ts 가 같은 /roles 에 붙어 받는다.
//
// GET, POST /api/admin/roles
//
// 권한 묶음 목록(권한 항목 포함)과 메뉴 목록, 그리고 새 묶음 만들기. 최고 관리자 전용이다.
// 새 묶음의 권한 항목은 PUT /api/admin/roles/:id/permissions 로 따로 채운다.
// 요청 검증과 응답 모양은 shared/roles/contract.ts 를 따른다.

import {
  type Role,
  type RolesList,
  type RoleWithPermissions,
  roleBody,
} from "../../../shared/roles/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { toItems } from "../../_lib/staff/permissions.js";
import { readResources } from "../../_lib/staff/resources.js";
import { ROLE_COLUMNS } from "../../_lib/staff/roles.js";

const guard = admin({
  permission: { key: "adminRoles" },
  unhandledMessage: "권한 묶음을 처리하지 못했습니다.",
  logLabel: "[admin/roles]",
});

export const roles = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const supabase = c.var.supabaseAdmin;
    const [roleRows, resources, permissions] = await Promise.all([
      supabase.from("admin_roles").select(ROLE_COLUMNS).order("created_at"),
      readResources(supabase),
      supabase
        .from("admin_role_permissions")
        .select("role_id, resource_key, level"),
    ]);
    if (roleRows.error || resources.error || permissions.error) {
      throw new Error("roles read failed");
    }

    const byRole = new Map<string, { resource_key: string; level: string }[]>();
    for (const row of permissions.data ?? []) {
      byRole.set(row.role_id, [...(byRole.get(row.role_id) ?? []), row]);
    }
    return c.json({
      items: (roleRows.data ?? []).map(
        (role): RoleWithPermissions => ({
          ...role,
          // DB 의 level 열은 edit, view, none 만 받는다(권한 단계 CHECK).
          permissions: toItems(
            byRole.get(role.id) ?? [],
          ) as RoleWithPermissions["permissions"],
        }),
      ),
      resources: resources.data ?? [],
    } satisfies RolesList);
  })
  .post("/", guard, validate("json", roleBody), async (c) => {
    const { name, description } = c.req.valid("json");
    const { data, error } = await c.var.supabaseAdmin
      .from("admin_roles")
      .insert({ name, description })
      .select(ROLE_COLUMNS)
      .single();
    if (error || !data) throw new Error("role insert failed");
    return c.json(data satisfies Role, 201);
  })
  .all("/", methodNotAllowed("GET", "POST"));
