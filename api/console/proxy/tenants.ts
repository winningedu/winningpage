// GET /api/console/proxy/tenants
//
// W5a 학교 고르기 목록. 대행을 시작할 수 있는 본사 관리자만 읽는다(start 와 같은 권한 teacherConsoleProxy edit).
// 기관 전체 목록은 숫자가 작아 검색은 화면이 한다. 소속 미지정 기관(is_catch_all)은 뺀다.

import { hasProxyEditPermission } from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학교 목록을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/proxy/tenants]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    if (
      !(await hasProxyEditPermission(ctx.supabaseAdmin, ctx.userId as string))
    ) {
      sendError(res, "coded", 403, "대행 권한이 없습니다.", "FORBIDDEN");
      return;
    }
    const { data, error } = await ctx.supabaseAdmin
      .from("tenants")
      .select("id, code, name")
      .eq("is_catch_all", false)
      .order("name");
    if (error || !data) throw new Error("tenants read failed");
    res.status(200).json({
      tenants: data.map((t) => ({ id: t.id, code: t.code, name: t.name })),
    });
  },
});
