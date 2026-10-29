// POST /api/admin/service-credit-adjust { profileId, programKey, delta, months?, reason }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 고객별 서비스 이용횟수를 수기로 추가(delta > 0)하거나 차감(delta < 0)한다.
// 원장은 DELETE 하지 않으므로 set 이 아니라 새 행으로만 남긴다(규칙: api/_lib/service-credit/adjust.ts).
//   - 추가: program_access_grants admin 부여 행
//   - 차감: fn_admin_deduct_service_credit (advisory 101 잠금 안에서 원장 적재)
// 처리 뒤 fn_sync_program_access_cache 로 program_access 캐시를 맞춘다.
//
// 응답 200 { ok, credit: ServiceCreditRow }
// 오류(coded): 400 INVALID_BODY / NOT_STUDENT, 404 PROFILE_NOT_FOUND,
//   409 NO_ENTITLEMENT / UNLIMITED_SESSIONS / INSUFFICIENT_CREDIT,
//   401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다. 판단과 조립은 api/_lib/service-credit/.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  buildAdjustGrantRow,
  buildDeductArgs,
  checkDeduction,
  isAdjustableProfile,
  validateAdjustBody,
} from "../_lib/service-credit/adjust.js";
import { readServiceCredit } from "../_lib/service-credit/summary.js";

const DEDUCT_STATUS_MESSAGES: Record<string, string> = {
  no_entitlement: "차감할 이용권이 없습니다.",
  unlimited_sessions: "회차 무제한 이용권은 차감할 수 없습니다.",
  insufficient_credit: "잔여 횟수보다 많이 차감할 수 없습니다.",
};

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "서비스 이용횟수 조정에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/service-credit-adjust",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = validateAdjustBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
      return;
    }
    const { body } = parsed;
    const db = ctx.supabaseAdmin;
    const actorId = ctx.admin?.userId;
    if (!actorId) throw new Error("ctx.admin 이 없습니다.");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, member_type, role")
      .eq("id", body.profileId)
      .maybeSingle();
    if (profileError)
      throw new Error(`profiles 조회 실패: ${profileError.message}`);
    if (!profile) {
      sendError(
        res,
        "coded",
        404,
        "회원을 찾을 수 없습니다.",
        "PROFILE_NOT_FOUND",
        { ok: false },
      );
      return;
    }
    if (!isAdjustableProfile(profile)) {
      sendError(
        res,
        "coded",
        400,
        "학생 또는 관리자 계정에만 조정할 수 있습니다.",
        "NOT_STUDENT",
        { ok: false },
      );
      return;
    }

    if (body.delta > 0) {
      const { error: insertError } = await db
        .from("program_access_grants")
        .insert(buildAdjustGrantRow(body, actorId, new Date().toISOString()));
      if (insertError)
        throw new Error(
          `program_access_grants 부여 실패: ${insertError.message}`,
        );
    } else {
      // 사전 확인은 친절한 거부용이다. 최종 판정은 DB 함수가 잠금 안에서 다시 한다.
      const check = checkDeduction(
        await readServiceCredit(db, body.profileId, body.programKey),
        -body.delta,
      );
      if (!check.ok) {
        sendError(res, "coded", 409, check.message, check.code, { ok: false });
        return;
      }
      const { data, error: deductError } = await db.rpc(
        "fn_admin_deduct_service_credit",
        buildDeductArgs(body, actorId),
      );
      if (deductError)
        throw new Error(
          `fn_admin_deduct_service_credit 실패: ${deductError.message}`,
        );
      const status = String((data as { status?: unknown } | null)?.status);
      if (status !== "deducted") {
        sendError(
          res,
          "coded",
          409,
          DEDUCT_STATUS_MESSAGES[status] ?? "차감할 수 없습니다.",
          status.toUpperCase(),
          { ok: false },
        );
        return;
      }
    }

    const { error: syncError } = await db.rpc("fn_sync_program_access_cache", {
      p_profile_id: body.profileId,
      p_program_key: body.programKey,
    });
    if (syncError)
      throw new Error(
        `fn_sync_program_access_cache 실패: ${syncError.message}`,
      );

    res.status(200).json({
      ok: true,
      credit: await readServiceCredit(db, body.profileId, body.programKey),
    });
  },
});

export const config = { runtime: "nodejs" };
