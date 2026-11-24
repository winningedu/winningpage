// GET, PATCH /api/admin/coupons/detail?id=<uuid>
//
// GET: 쿠폰 한 건. PATCH: 같은 본문(CouponPayload)으로 전체 수정. 없는 id 는 404 NOT_FOUND.
// 경로 파라미터를 쓰지 않는 라우팅이라 id 는 쿼리로 받는다. 저장 제약 위반은 sendCouponSaveError 가 409, 422 로 바꾼다.
// 권한: 메뉴 coupons(GET view, PATCH edit).

import { z } from "zod";
import { sendNotFound } from "../../../_lib/coupon/notFound.js";
import { parseCouponPayload } from "../../../_lib/coupon/payload.js";
import { sendCouponSaveError } from "../../../_lib/coupon/saveError.js";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰을 처리하지 못했어요.",
  logLabel: "[admin/coupons/detail]",
  query: z.object({ id: z.uuid() }),
  handler: async (req, res, ctx) => {
    const { id } = ctx.query;

    if (req.method === "PATCH") {
      const payload = parseCouponPayload(res, req.body);
      if (!payload) return;
      const { data, error } = await ctx.supabaseAdmin
        .from("coupons")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) {
        sendCouponSaveError(res, error);
        return;
      }
      if (!data) {
        sendNotFound(res, "쿠폰");
        return;
      }
      res.status(200).json(data);
      return;
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("coupon read failed");
    if (!data) {
      sendNotFound(res, "쿠폰");
      return;
    }
    res.status(200).json(data);
  },
});
