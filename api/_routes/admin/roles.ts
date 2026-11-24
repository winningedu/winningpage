// GET, POST /api/admin/roles
//
// 권한 묶음 목록(권한 항목 포함)과 메뉴 목록, 그리고 새 묶음 만들기. 최고 관리자 전용이다.
// 새 묶음의 권한 항목은 PUT /api/admin/roles/:id/permissions 로 따로 채운다.

import type { z } from "zod";
import { defineHandler, parseOrReject } from "../../_lib/handler.js";
import { toItems } from "../../_lib/staff/permissions.js";
import { readResources } from "../../_lib/staff/resources.js";
import { ROLE_COLUMNS, roleBody } from "../../_lib/staff/roles.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminRoles" },
  unhandledMessage: "권한 묶음을 처리하지 못했습니다.",
  logLabel: "[admin/roles]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;

    if (req.method === "POST") {
      const parsed = parseOrReject(res, "problem", roleBody, req.body);
      if (!parsed) return;
      const { name, description } = parsed.value as z.output<typeof roleBody>;
      const { data, error } = await admin
        .from("admin_roles")
        .insert({ name, description })
        .select(ROLE_COLUMNS)
        .single();
      if (error || !data) throw new Error("role insert failed");
      res.status(201).json(data);
      return;
    }

    const [roles, resources, permissions] = await Promise.all([
      admin.from("admin_roles").select(ROLE_COLUMNS).order("created_at"),
      readResources(admin),
      admin
        .from("admin_role_permissions")
        .select("role_id, resource_key, level"),
    ]);
    if (roles.error || resources.error || permissions.error) {
      throw new Error("roles read failed");
    }

    const byRole = new Map<string, { resource_key: string; level: string }[]>();
    for (const row of permissions.data ?? []) {
      byRole.set(row.role_id, [...(byRole.get(row.role_id) ?? []), row]);
    }
    res.status(200).json({
      items: (roles.data ?? []).map((role) => ({
        ...role,
        permissions: toItems(byRole.get(role.id) ?? []),
      })),
      resources: resources.data ?? [],
    });
  },
});
