// /api/admin/me 아래 관리자 본인 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/me", me) 로 붙인다.
// 응답 모양은 shared/admin-me/contract.ts 를 따른다.
// GET /permissions: 로그인한 관리자 본인의 메뉴별 최종 권한과 최고 관리자 여부. 사이드바와 라우트 가드가 읽는다.
//   permission "none": 모든 관리자가 자기 권한 맵을 알아야 어느 메뉴가 열리는지 정할 수 있어 메뉴 권한을 걸지 않는다(감사 행도 없다).
// POST /activate: 초대받은 관리자의 본인 admin_members 행을 invited 에서 active 로 올린다(fn_activate_admin_member).
//   쓰기라서 GET 권한 조회에 섞지 않고 따로 POST 로 둔다. 호출자는 아직 관리자가 아니라(profiles.role 이 user) 인증은 user() 다.
//   함수가 인자 없이 auth.uid() 를 읽으므로 service_role 이 아니라 호출자 토큰 클라이언트로 부른다.
//   같은 요청을 다시 보내도 같은 행을 돌려준다(함수가 invited 만 active 로 옮긴다).

import type {
  AdminActivation,
  AdminPermissions,
} from "../../../shared/admin-me/contract.js";
import { admin, user } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { createSupabaseUserClient } from "../../_lib/supabaseUser.js";

const permissionsGuard = admin({
  permission: "none",
  unhandledMessage: "관리자 권한을 불러오지 못했습니다.",
  logLabel: "[admin/me/permissions]",
});
const activateGuard = user({
  headers: { "Cache-Control": "no-store" },
  unhandledMessage: "관리자 활성화에 실패했습니다.",
  logLabel: "[admin/me/activate]",
});

export const me = adminFactory
  .createApp()
  .get("/permissions", permissionsGuard, async (c) => {
    const userId = c.var.userId;
    if (!userId) throw new Error("c.var.userId 가 없습니다.");
    const [permissionsResult, superResult] = await Promise.all([
      c.var.supabaseAdmin.rpc("fn_admin_effective_permissions", {
        p_profile_id: userId,
      }),
      c.var.supabaseAdmin.rpc("fn_is_super_admin", { p_profile_id: userId }),
    ]);
    if (permissionsResult.error || superResult.error) {
      throw new Error("admin permission lookup failed");
    }

    const permissions: AdminPermissions["permissions"] = {};
    for (const row of permissionsResult.data ?? []) {
      const key = String(row.resource_key || "");
      const level = String(row.level || "");
      // none 은 판정 함수가 이미 빼지만 방어적으로 거른다.
      if (key && (level === "view" || level === "edit")) {
        permissions[key] = level;
      }
    }

    return c.json({
      permissions,
      isSuper: superResult.data === true,
    } satisfies AdminPermissions);
  })
  .all("/permissions", methodNotAllowed("GET"))
  .post("/activate", activateGuard, async (c) => {
    const token = c.var.token;
    if (!token) throw new Error("c.var.token 이 없습니다.");
    const { data, error } = await createSupabaseUserClient(token).rpc(
      "fn_activate_admin_member",
    );
    if (error) throw new Error("admin activation failed");

    return c.json({
      status: data?.status ?? null,
    } satisfies AdminActivation);
  })
  .all("/activate", methodNotAllowed("POST"));
