// GET /api/admin/coupons/:id/redemptions
//
// 쿠폰의 사용 이력(최근 200건)에 사용자 이름과 이메일을 붙여 { items } 로 돌려준다. 없는 쿠폰은 404 NOT_FOUND.
// 권한: 메뉴 coupons view(defineHandler permission).

import { z } from "zod";
import { sendNotFound } from "../../../../_lib/coupon/notFound.js";
import { attachUsers } from "../../../../_lib/coupon/users.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const PAGE_LIMIT = 200;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰 사용 이력을 불러오지 못했어요.",
  logLabel: "[admin/coupons/redemptions]",
  query: z.object({ id: z.uuid() }),
  handler: async (_req, res, ctx) => {
    const { id: couponId } = ctx.query;

    const coupon = await ctx.supabaseAdmin
      .from("coupons")
      .select("id")
      .eq("id", couponId)
      .maybeSingle();
    if (coupon.error) throw new Error("coupon read failed");
    if (!coupon.data) {
      sendNotFound(res, "쿠폰");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("coupon_redemptions")
      .select("*")
      .eq("coupon_id", couponId)
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);
    if (error) throw new Error("coupon redemptions read failed");

    res.status(200).json({
      items: await attachUsers(ctx.supabaseAdmin, data ?? []),
    });
  },
});
