// PUT /api/admin/roles/:id/permissions
//
// 권한 묶음의 권한 항목을 통째로 바꾼다. 최고 관리자 전용이다.
// 옛 화면처럼 지우고 다시 넣는다(두 단계라 원자적이지 않다).

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { sendError } from "../../../../_lib/httpResponse.js";
import {
  checkResourceKeys,
  permissionItemsBody,
  replacePermissions,
} from "../../../../_lib/staff/permissions.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminRoles" },
  query: z.object({ id: z.guid() }),
  body: permissionItemsBody,
  unhandledMessage: "권한 항목을 저장하지 못했습니다.",
  logLabel: "[admin/roles/id/permissions]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    const { items } = ctx.body;

    // 없는 묶음에 항목 행을 만들지 않도록 쓰기 전에 확인한다.
    const { data: role, error } = await admin
      .from("admin_roles")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("role read failed");
    if (!role) {
      sendError(
        res,
        "problem",
        404,
        "권한 묶음을 찾을 수 없습니다.",
        "NOT_FOUND",
      );
      return;
    }
    if (!(await checkResourceKeys(res, admin, items))) return;

    await replacePermissions(
      admin,
      { table: "admin_role_permissions", ownerColumn: "role_id", ownerId: id },
      items,
    );
    res.status(200).json({ items });
  },
});
