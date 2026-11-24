// GET /api/admin/coupons/user-search?q=<1..100자>
//
// 쿠폰 발급 대상 검색. 학생만이 아니라 전체 프로필에서 이메일이나 이름으로 20건까지 찾는다(그래서 학생 검색과 따로 둔다).
// 권한: 메뉴 coupons view(defineHandler permission).

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const RESULT_LIMIT = 20;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
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

    const { data, error } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(RESULT_LIMIT);
    if (error) throw new Error("profiles search failed");

    res.status(200).json({ items: data ?? [] });
  },
});
