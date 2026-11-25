// GET /api/admin/staff
//
// 관리자 목록 화면(adminMembers)이 한 번에 쓰는 목록, 권한 묶음 선택지, 메뉴 목록.
// 최고 관리자 전용 메뉴라 읽기도 최고 관리자만 된다(판정은 defineHandler 의 permission).

import { defineHandler } from "../../_lib/handler.js";
import { readResources } from "../../_lib/staff/resources.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminMembers" },
  unhandledMessage: "관리자 목록을 불러오지 못했습니다.",
  logLabel: "[admin/staff]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const [directory, roles, resources] = await Promise.all([
      admin
        .from("admin_member_directory")
        .select("*")
        .order("invited_at", { ascending: false }),
      admin.from("admin_roles").select("id, name, is_super").order("name"),
      readResources(admin),
    ]);
    if (directory.error || roles.error || resources.error) {
      throw new Error("staff list read failed");
    }
    res.status(200).json({
      items: directory.data ?? [],
      roles: roles.data ?? [],
      resources: resources.data ?? [],
    });
  },
});
