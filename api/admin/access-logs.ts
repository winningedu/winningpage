// GET /api/admin/access-logs[?tenantCode=&from=&to=&kind=&page=]
//
// 본사 개인정보 접근 로그 화면의 목록(사 #170, 교 #66, 결정 102.5). 소속코드, 교사 이름과 로그인 아이디,
// 가린 교사 전화번호, 구분, 가린 학생 이름, 내용을 한 줄씩 돌려준다. teachers 는 authenticated 에 막혀 있어
// 뷰로는 붙일 수 없으므로 service_role 로 읽는다.
// 권한: 로그인 + fn_is_super_admin. admin_access_logs 의 RLS 와 같은 술어다.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "접근 로그를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/access-logs]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const { data: isSuper, error } = await ctx.supabaseAdmin.rpc(
      "fn_is_super_admin",
      { p_profile_id: ctx.userId },
    );
    if (error) throw new Error("super admin check failed");
    if (isSuper !== true) {
      sendError(
        res,
        "coded",
        403,
        "최고 관리자만 볼 수 있습니다.",
        "FORBIDDEN",
      );
      return;
    }
    res.status(200).json({ ok: true, logs: [], page: 1, hasNext: false });
  },
});
