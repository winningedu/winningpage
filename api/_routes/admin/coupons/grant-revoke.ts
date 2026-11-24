// POST /api/admin/coupons/grant-revoke  { grantId: 양의 정수, reason?: string }
//
// 발급 한 건을 회수한다. 이미 회수된 발급은 409 GRANT_ALREADY_REVOKED 다.
// 대상 행이 없으면 404 NOT_FOUND. fn_revoke_coupon_grant 가 auth.uid() 로 is_admin() 을 확인하므로 관리자 토큰 클라이언트로 부른다
// (service_role 은 uid 가 null 이라 거부된다). 회수는 revoked_at 이 비었을 때만 바뀌는 조건부 갱신이라 다시 불러도 두 번 회수되지 않는다.
// 권한: 메뉴 coupons edit(POST 기본).

import { z } from "zod";
import { sendNotFound } from "../../../_lib/coupon/notFound.js";
import { REVOKE_ERRORS, sendRpcError } from "../../../_lib/coupon/rpcError.js";
import { defineHandler } from "../../../_lib/handler.js";
import { getBearerToken } from "../../../_lib/serviceAccess.js";
import { createSupabaseUserClient } from "../../../_lib/supabaseUser.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "coupons" },
  unhandledMessage: "쿠폰 발급을 회수하지 못했어요.",
  logLabel: "[admin/coupons/grant-revoke]",
  body: z.object({
    grantId: z.int().positive(),
    reason: z.string().optional(),
  }),
  handler: async (req, res, ctx) => {
    const { grantId, reason } = ctx.body;

    const target = await ctx.supabaseAdmin
      .from("coupon_grants")
      .select("id")
      .eq("id", grantId)
      .maybeSingle();
    if (target.error) throw new Error("coupon_grants read failed");
    if (!target.data) {
      sendNotFound(res, "발급");
      return;
    }

    // p_reason 은 선택 인자라 값이 없으면 키를 뺀다.
    const trimmed = reason?.trim();
    const { data, error } = await createSupabaseUserClient(
      getBearerToken(req),
    ).rpc("fn_revoke_coupon_grant", {
      p_grant_id: grantId,
      ...(trimmed ? { p_reason: trimmed } : {}),
    });
    if (error) {
      sendRpcError(res, error, REVOKE_ERRORS);
      return;
    }
    res.status(200).json(data);
  },
});
