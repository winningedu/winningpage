// /api/admin/service-credit-adjust 의 POST. 관리자 앱(api/_routes/admin/app.ts)이 .route("/service-credit-adjust", serviceCreditAdjust) 로 붙인다.
// POST { profileId, programKey, delta, months?, reason }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 고객별 서비스 이용횟수를 수기로 추가(delta > 0)하거나 차감(delta < 0)한다.
// 원장은 DELETE 하지 않으므로 set 이 아니라 새 행으로만 남긴다(규칙: api/_lib/service-credit/adjust.ts).
//   - 추가: program_access_grants admin 부여 행
//   - 차감: fn_admin_deduct_service_credit (advisory 101 잠금 안에서 원장 적재)
// 처리 뒤 fn_sync_program_access_cache 로 program_access 캐시를 맞춘다.
//
// 권한: 메뉴 serviceCreditAdjust(POST edit).
//
// 응답 200 { credit: ServiceCreditRow } (shared/service-credit/contract.ts)
// 오류(problem): 400 VALIDATION_FAILED / INVALID_BODY / NOT_STUDENT, 404 PROFILE_NOT_FOUND,
//   409 NO_ENTITLEMENT / UNLIMITED_SESSIONS / INSUFFICIENT_CREDIT,
//   401/403 인증, 405 METHOD_NOT_ALLOWED, 500
//
// 본문은 zod 가 모양을 보고 모르는 키를 버린다. 값 규칙은 validateAdjustBody 가 맡고 insert 와 rpc 인자는
// buildAdjustGrantRow, buildDeductArgs 의 키만 쓴다. 멱등 키는 아직 없다(후속 PR). 판단과 조립은 api/_lib/service-credit/.

import {
  type AdjustResult,
  adjustBody,
  SERVICE_CREDIT_ERROR,
} from "../../../shared/service-credit/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  buildAdjustGrantRow,
  buildDeductArgs,
  checkDeduction,
  isAdjustableProfile,
  validateAdjustBody,
} from "../../_lib/service-credit/adjust.js";
import { readServiceCredit } from "../../_lib/service-credit/summary.js";

const DEDUCT_STATUS_MESSAGES: Record<string, string> = {
  no_entitlement: "차감할 이용권이 없습니다.",
  unlimited_sessions: "회차 무제한 이용권은 차감할 수 없습니다.",
  insufficient_credit: "잔여 횟수보다 많이 차감할 수 없습니다.",
};

const guard = admin({
  permission: { key: "serviceCreditAdjust" },
  unhandledMessage: "서비스 이용횟수 조정에 실패했습니다.",
  logLabel: "admin/service-credit-adjust",
});

export const serviceCreditAdjust = adminFactory
  .createApp()
  .post("/", guard, validate("json", adjustBody), async (c) => {
    const parsed = validateAdjustBody(c.req.valid("json"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        SERVICE_CREDIT_ERROR.INVALID_BODY,
      );
    }
    const { body } = parsed;
    const db = c.var.supabaseAdmin;
    const actorId = c.var.userId;
    if (!actorId) throw new Error("관리자 id 가 없습니다.");

    // 차감이면 이용권 요약 읽기를 회원 확인과 함께 시작한다. 응답은 회원 확인(404, 400)이 먼저다.
    const creditRead =
      body.delta > 0
        ? undefined
        : readServiceCredit(db, body.profileId, body.programKey);
    creditRead?.catch(() => {});
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, member_type, role")
      .eq("id", body.profileId)
      .maybeSingle();
    if (profileError)
      throw new Error(`profiles 조회 실패: ${profileError.message}`);
    if (!profile) {
      throw new ProblemError(
        404,
        "회원을 찾을 수 없습니다.",
        SERVICE_CREDIT_ERROR.PROFILE_NOT_FOUND,
      );
    }
    if (!isAdjustableProfile(profile)) {
      throw new ProblemError(
        400,
        "학생 또는 관리자 계정에만 조정할 수 있습니다.",
        SERVICE_CREDIT_ERROR.NOT_STUDENT,
      );
    }

    if (creditRead === undefined) {
      const { error: insertError } = await db
        .from("program_access_grants")
        .insert(buildAdjustGrantRow(body, actorId, new Date().toISOString()));
      if (insertError)
        throw new Error(
          `program_access_grants 부여 실패: ${insertError.message}`,
        );
    } else {
      // 사전 확인은 친절한 거부용이다. 최종 판정은 DB 함수가 잠금 안에서 다시 한다.
      const check = checkDeduction(await creditRead, -body.delta);
      if (!check.ok) throw new ProblemError(409, check.message, check.code);
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
        throw new ProblemError(
          409,
          DEDUCT_STATUS_MESSAGES[status] ?? "차감할 수 없습니다.",
          status.toUpperCase(),
        );
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

    return c.json({
      credit: await readServiceCredit(db, body.profileId, body.programKey),
    } satisfies AdjustResult);
  })
  .all("/", methodNotAllowed("POST"));
