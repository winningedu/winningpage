// GET /api/admin/coupons/user-search?q=<1..100자>
//
// 쿠폰 발급 대상 검색. 학생만이 아니라 전체 프로필에서 이메일이나 이름으로 20건까지 찾는다(그래서 학생 검색과 따로 둔다).
// 권한: 메뉴 coupons edit(호출처가 발급 흐름뿐이라 조회 전용 관리자에게는 열지 않는다).

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const RESULT_LIMIT = 20;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons", level: "edit" },
  unhandledMessage: "사용자를 검색하지 못했어요.",
  logLabel: "[admin/coupons/user-search]",
  query: z.object({ q: z.string().min(1).max(100) }),
  handler: async (_req, res, ctx) => {
    // PostgREST 의 or 필터는 콤마, 괄호로 절을 구분한다. 검색어에 그 문자가 있으면 필터 문법이 깨지므로 걷어낸다.
    const q = ctx.query.q.replace(/[,()*"\\]/g, "").trim();
    if (!q) {
      res.status(200).json({ items: [] });
      return;
    }

    // ilike 의 기본 이스케이프 문자는 백슬래시다. 위에서 백슬래시를 걷었으므로 %, _ 만 이스케이프하면 된다.
    const pattern = q.replace(/[%_]/g, "\\$&");

    const { data, error } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .or(`email.ilike.%${pattern}%,name.ilike.%${pattern}%`)
      .limit(RESULT_LIMIT);
    if (error) throw new Error("profiles search failed");

    res.status(200).json({ items: data ?? [] });
  },
});
