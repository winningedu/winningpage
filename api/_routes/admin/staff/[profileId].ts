// GET /api/admin/staff/:profileId
//
// 관리자 한 명의 상세: 목록 뷰의 행, 개별 권한(덮어쓰기), 묶음과 합친 실효 권한.
// profileId 는 경로에서 오고(디스패처가 req.query.profileId 에 넣는다) 최고 관리자 전용이다.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const pathSchema = z.object({ profileId: z.guid() });

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminMembers" },
  query: pathSchema,
  unhandledMessage: "관리자 정보를 처리하지 못했습니다.",
  logLabel: "[admin/staff/profileId]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { profileId } = ctx.query;

    const { data: member, error } = await admin
      .from("admin_member_directory")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error("staff read failed");
    if (!member) {
      sendError(res, "problem", 404, "관리자를 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const [overrides, effective] = await Promise.all([
      admin
        .from("admin_member_permissions")
        .select("resource_key, level")
        .eq("profile_id", profileId),
      admin.rpc("fn_admin_effective_permissions", { p_profile_id: profileId }),
    ]);
    if (overrides.error || effective.error) {
      throw new Error("staff permissions read failed");
    }

    const toItems = (rows: { resource_key: string; level: string }[] | null) =>
      (rows ?? []).map((row) => ({
        resourceKey: row.resource_key,
        level: row.level,
      }));
    res.status(200).json({
      member,
      overrides: toItems(overrides.data),
      effective: toItems(effective.data),
    });
  },
});
