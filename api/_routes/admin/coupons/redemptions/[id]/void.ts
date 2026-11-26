// POST /api/admin/coupons/redemptions/:id/void  { reason?: string }
//
// 사용 이력 한 건을 취소해 주문의 쿠폰 사용을 되돌린다. 이미 취소된 이력은 409 REDEMPTION_ALREADY_VOIDED 다.
// 대상 행이 없으면 404 NOT_FOUND. fn_void_coupon_redemption 가 auth.uid() 로 is_admin() 을 확인하므로 관리자 토큰 클라이언트로 부른다
// (service_role 은 uid 가 null 이라 거부된다). 취소는 voided_at 이 비었을 때만 바뀌는 조건부 갱신이라 다시 불러도 두 번 취소되지 않는다.
// 권한: 메뉴 coupons edit(POST 기본).

import { z } from "zod";
import { positiveIntId } from "../../../../../../shared/http/params.js";
import { sendNotFound } from "../../../../../_lib/coupon/notFound.js";
import {
  sendRpcError,
  VOID_ERRORS,
} from "../../../../../_lib/coupon/rpcError.js";
import { defineHandler } from "../../../../../_lib/handler.js";
import { getBearerToken } from "../../../../../_lib/serviceAccess.js";
import { createSupabaseUserClient } from "../../../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  // 기존 사용 이력을 바꾸는 일이라 등록이 아니라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: "쿠폰 사용 이력을 취소하지 못했어요.",
  logLabel: "[admin/coupons/redemptions/[id]/void]",
  query: z.object({ id: positiveIntId }),
  body: z.object({ reason: z.string().optional() }),
  handler: async (req, res, ctx) => {
    const { id: redemptionId } = ctx.query;
    const { reason } = ctx.body;

    const target = await ctx.supabaseAdmin
      .from("coupon_redemptions")
      .select("id")
      .eq("id", redemptionId)
      .maybeSingle();
    if (target.error) throw new Error("coupon_redemptions read failed");
    if (!target.data) {
      sendNotFound(res, "사용 이력");
      return;
    }

    // p_reason 은 선택 인자라 값이 없으면 키를 뺀다.
    const trimmed = reason?.trim();
    const { data, error } = await createSupabaseUserClient(
      getBearerToken(req),
    ).rpc("fn_void_coupon_redemption", {
      p_redemption_id: redemptionId,
      ...(trimmed ? { p_reason: trimmed } : {}),
    });
    if (error) {
      sendRpcError(res, error, VOID_ERRORS);
      return;
    }
    res.status(200).json(data);
  },
});
