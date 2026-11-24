// GET, POST /api/admin/coupons/grants
//
// GET ?couponId=<uuid>: 쿠폰의 발급 이력(최근 200건)에 사용자 이름과 이메일을 붙여 { items } 로 돌려준다.
// POST { couponId, userId }: fn_grant_coupon 으로 발급한다. 이미 살아 있는 발급이 있으면 그 행을 그대로 돌려준다
//   (부분 유니크 인덱스로 멱등). 함수가 auth.uid() 로 is_admin() 을 확인하므로 관리자 토큰 클라이언트로 부른다(service_role 은 uid 가 null).
// 없는 쿠폰은 404 NOT_FOUND. 권한: 메뉴 coupons(GET view, POST edit).
// GET 은 쿼리, POST 는 본문을 받아 defineHandler 의 query, body 옵션 대신 핸들러 안에서 검증한다.

import { z } from "zod";
import { sendNotFound } from "../../../_lib/coupon/notFound.js";
import { parseInput } from "../../../_lib/coupon/parseInput.js";
import { GRANT_ERRORS, sendRpcError } from "../../../_lib/coupon/rpcError.js";
import { attachUsers } from "../../../_lib/coupon/users.js";
import { defineHandler } from "../../../_lib/handler.js";
import { getBearerToken } from "../../../_lib/serviceAccess.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

const PAGE_LIMIT = 200;

const getQuery = z.object({ couponId: z.uuid() });
const postBody = z.object({ couponId: z.uuid(), userId: z.uuid() });

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰 발급을 처리하지 못했어요.",
  logLabel: "[admin/coupons/grants]",
  handler: async (req, res, ctx) => {
    const isPost = req.method === "POST";
    const input = isPost
      ? parseInput(res, postBody, req.body)
      : parseInput(res, getQuery, req.query);
    if (!input) return;

    const coupon = await ctx.supabaseAdmin
      .from("coupons")
      .select("id")
      .eq("id", input.couponId)
      .maybeSingle();
    if (coupon.error) throw new Error("coupon read failed");
    if (!coupon.data) {
      sendNotFound(res, "쿠폰");
      return;
    }

    if ("userId" in input) {
      const { data, error } = await createSupabaseUserClient(
        getBearerToken(req),
      ).rpc("fn_grant_coupon", {
        p_coupon_id: input.couponId,
        p_user_id: input.userId,
      });
      if (error) {
        sendRpcError(res, error, GRANT_ERRORS);
        return;
      }
      res.status(200).json(data);
      return;
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("coupon_grants")
      .select("*")
      .eq("coupon_id", input.couponId)
      .order("granted_at", { ascending: false })
      .limit(PAGE_LIMIT);
    if (error) throw new Error("coupon grants read failed");

    res.status(200).json({
      items: await attachUsers(ctx.supabaseAdmin, data ?? []),
    });
  },
});
