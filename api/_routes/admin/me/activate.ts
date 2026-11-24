// POST /api/admin/me/activate
//
// 초대받은 관리자의 본인 admin_members 행을 invited 에서 active 로 올린다(fn_activate_admin_member).
// 쓰기라서 GET 권한 조회에 섞지 않고 따로 POST 로 둔다(GET 은 안전하고 캐시 가능해야 한다).
// 호출자는 아직 관리자가 아니라(profiles.role 이 user) auth 는 "user" 다.
// 함수가 인자 없이 auth.uid() 를 읽으므로 service_role 이 아니라 호출자 토큰 클라이언트로 부른다.
// 같은 요청을 다시 보내도 같은 행을 돌려준다(함수가 invited 만 active 로 옮긴다).
// 응답: 200 { status: string | null } (행이 없으면 null)

import { defineHandler } from "../../../_lib/handler.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "problem",
  headers: { "Cache-Control": "no-store" },
  unhandledMessage: "관리자 활성화에 실패했습니다.",
  logLabel: "[admin/me/activate]",
  handler: async (_req, res, ctx) => {
    if (!ctx.token) throw new Error("ctx.token 이 없습니다.");
    const { data, error } = await createSupabaseUserClient(ctx.token).rpc(
      "fn_activate_admin_member",
    );
    if (error) throw new Error("admin activation failed");

    res.status(200).json({ status: data?.status ?? null });
  },
});
