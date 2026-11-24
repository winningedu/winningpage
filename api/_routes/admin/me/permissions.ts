// GET /api/admin/me/permissions
//
// 로그인한 관리자 본인의 메뉴별 최종 권한과 최고 관리자 여부. 사이드바와 라우트 가드가 읽는다.
// permission 옵션을 걸지 않는다: 모든 관리자가 자기 권한 맵을 알아야 어느 메뉴가 열리는지 정할 수 있다.
// 응답: 200 { permissions: { [메뉴키]: "view" | "edit" }, isSuper }

import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  headers: { "Cache-Control": "no-store" },
  unhandledMessage: "관리자 권한을 불러오지 못했습니다.",
  logLabel: "[admin/me/permissions]",
  handler: async (_req, res, ctx) => {
    const userId = ctx.admin?.userId;
    if (!userId) throw new Error("ctx.admin 이 없습니다.");
    const [permissionsResult, superResult] = await Promise.all([
      ctx.supabaseAdmin.rpc("fn_admin_effective_permissions", {
        p_profile_id: userId,
      }),
      ctx.supabaseAdmin.rpc("fn_is_super_admin", { p_profile_id: userId }),
    ]);
    if (permissionsResult.error || superResult.error) {
      throw new Error("admin permission lookup failed");
    }

    const permissions: Record<string, "view" | "edit"> = {};
    for (const row of permissionsResult.data ?? []) {
      const key = String(row.resource_key || "");
      const level = String(row.level || "");
      // none 은 판정 함수가 이미 빼지만 방어적으로 거른다.
      if (key && (level === "view" || level === "edit")) {
        permissions[key] = level;
      }
    }

    res.status(200).json({ permissions, isSuper: superResult.data === true });
  },
});
