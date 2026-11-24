// PUT /api/admin/staff/:profileId/permissions
//
// 관리자 한 명의 개별 권한(덮어쓰기)을 통째로 바꾼다. 최고 관리자 전용이다.
// 옛 화면처럼 지우고 다시 넣는다(두 단계라 원자적이지 않다). granted_by 는 채우지 않는다.

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
  permission: { key: "adminMembers" },
  query: z.object({ profileId: z.guid() }),
  body: permissionItemsBody,
  unhandledMessage: "개별 권한을 저장하지 못했습니다.",
  logLabel: "[admin/staff/profileId/permissions]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { profileId } = ctx.query;
    const { items } = ctx.body;

    // 없는 관리자에게 권한 행을 만들지 않도록 쓰기 전에 확인한다.
    const { data: member, error } = await admin
      .from("admin_members")
      .select("profile_id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error("staff read failed");
    if (!member) {
      sendError(res, "problem", 404, "관리자를 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    if (!(await checkResourceKeys(res, admin, items))) return;

    await replacePermissions(
      admin,
      {
        table: "admin_member_permissions",
        ownerColumn: "profile_id",
        ownerId: profileId,
      },
      items,
    );
    res.status(200).json({ items });
  },
});
