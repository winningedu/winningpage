// POST /api/diagnosis/consume  { attemptId }
// Authorization: Bearer <access_token>
//
// 학습진단 제출 소진 — consume_diagnosis_attempt RPC(supabase/migrations/
// 20260821000005_diagnosis_gating.sql)를 감싸는 유일한 라우트다. 무료 1회
// 미사용이면 무료로 기록하고, 사용했으면 diagnose 이용권 회차에서 1개 차감한다.
// attemptId는 클라이언트가 제출 직전에 만드는 uuid로, 더블클릭·재시도 멱등 키다
// (RPC pk 충돌이 아니라 같은 attempt id 재조회로 처리된다 — 아래 already_recorded).
//
// 응답 규격은 api/performance/recommend-topics.ts와 같은 관례(fail() 헬퍼,
// 코드별 HTTP status)를 따른다 — 이 저장소의 회차 소진 라우트가 이미 그 모양으로
// 통일돼 있어(§9.3 참고 스타일), 학습진단만 200+ok:false로 다르게 갈 이유가 없다.
//
//   → 200 { ok:true, status:'free_used'|'charged'|'already_recorded', charged,
//           quotaRemaining, quotaTotal, planEndsAt }
//   → 400 INVALID_ATTEMPT_ID
//   → 401 UNAUTHENTICATED
//   → 403 NO_ENTITLEMENT / ENTITLEMENT_EXPIRED
//   → 405 METHOD_NOT_ALLOWED
//   → 409 QUOTA_EXHAUSTED / ATTEMPT_CONFLICT
//   → 500 INTERNAL
//   스쿨멘토(SITE=schoolmentor)는 fn_consume_tenant_diagnosis 로 기관 한도에서 센다. 코드는 같고
//   403, 409 응답에 tenantReason(catch_all|disabled|outside_period|grace|month_cap|term_cap)이 더 실린다.
//   catch_all, disabled 는 403 NO_ENTITLEMENT, outside_period, grace 는 403 ENTITLEMENT_EXPIRED,
//   month_cap, term_cap 은 409 QUOTA_EXHAUSTED 다. 성공 status 는 charged 또는 already_recorded 다.
//
// ⚠️ RPC는 service_role 전용(SECURITY DEFINER, grant는 service_role에만)이라
//    이 라우트가 유일한 소비 진입점이다 — 프런트가 diagnosis_attempts에 직접 쓸 방법이 없다.
//
// ⚠️ 에러 바디에는 `ok: false`가 함께 실린다 — api/_lib/httpResponse.ts의 "coded"
//    프리셋(성능 라우트 관례, extra는 error 형제로 스프레드)은 이 필드를 기본
//    포함하지 않으므로, 아래 fail()에서 extra에 `ok: false`를 얹어 기존 바이트를
//    그대로 재현한다(키 순서만 error가 먼저 오도록 바뀌는데, JSON 파싱 결과는
//    동일하다 — api/docs/batch-1-issues.md 기록).

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../../_lib/site.js";
import {
  mapTenantConsumeResult,
  readTenantQuota,
  readTenantUsage,
} from "../../_lib/tenantUsage.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  // dev 원본의 로컬 fail()은 401·미처리 500을 포함한 모든 에러 바디에 ok:false를
  // 얹었다. 여기 handler 내부의 fail()은 이미 그렇게 하지만(위 주석), defineHandler
  // 공통 경로(auth 401 / 미처리 500)는 opts로 지정하지 않으면 그 필드가 빠진다.
  authFailureExtra: { ok: false },
  unhandledMessage: "학습진단 제출 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "diagnosis/consume",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const attemptId =
      typeof body.attemptId === "string" ? body.attemptId.trim() : "";
    if (!UUID_RE.test(attemptId)) {
      fail(res, 400, "INVALID_ATTEMPT_ID", "attemptId가 올바르지 않습니다.");
      return;
    }

    // 스쿨멘토: 기관 한도에서 센다(무료 1회 없음). 결과를 아래 같은 응답 코드로 옮기고
    // 거부 사유는 tenantReason(catch_all, disabled, outside_period, grace, month_cap, term_cap)에 둔다.
    if (isSchoolmentorSite()) {
      const { data: tenantResult, error: tenantError } =
        await ctx.supabaseAdmin.rpc("fn_consume_tenant_diagnosis", {
          p_attempt_id: attemptId,
          p_profile: userId,
        });
      if (tenantError) {
        console.error("diagnosis/consume 기관 RPC 실패:", tenantError);
        fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
        return;
      }
      if (tenantResult === "attempt_conflict") {
        fail(
          res,
          409,
          "ATTEMPT_CONFLICT",
          "이미 사용된 요청입니다. 다시 시도해 주세요.",
        );
        return;
      }
      const mapped = mapTenantConsumeResult(
        tenantResult === "already_recorded" ? "already_consumed" : tenantResult,
      );
      const quota = readTenantQuota(
        await readTenantUsage(ctx.supabaseAdmin, userId, "diagnose"),
      );
      const quotaFields = {
        quotaRemaining: quota.quotaRemaining,
        quotaTotal: quota.quotaTotal,
        planEndsAt: quota.planEndsAt,
      };
      const tenantReason = mapped.tenantReason;
      if (mapped.status === "charged") {
        res.status(200).json({
          ok: true,
          status: "charged",
          charged: true,
          ...quotaFields,
        });
      } else if (mapped.status === "already_charged") {
        res.status(200).json({
          ok: true,
          status: "already_recorded",
          charged: false,
          ...quotaFields,
        });
      } else if (mapped.status === "quota_exhausted") {
        fail(
          res,
          409,
          "QUOTA_EXHAUSTED",
          "이용 가능한 횟수를 모두 사용했어요.",
          { ...quotaFields, tenantReason },
        );
      } else if (mapped.status === "entitlement_expired") {
        fail(res, 403, "ENTITLEMENT_EXPIRED", "이용권 사용 기간이 끝났어요.", {
          planEndsAt: quotaFields.planEndsAt,
          tenantReason,
        });
      } else {
        fail(
          res,
          403,
          "NO_ENTITLEMENT",
          "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
          { tenantReason },
        );
      }
      return;
    }

    const { data: resultRaw, error: rpcError } = await ctx.supabaseAdmin.rpc(
      "consume_diagnosis_attempt",
      {
        p_attempt_id: attemptId,
        p_profile_id: userId,
        p_reason: "diagnosis:survey-submit",
      },
    );

    if (rpcError) {
      console.error("diagnosis/consume RPC 실패:", rpcError);
      fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
      return;
    }

    const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
    const status = String(result.status || "");

    const quotaFields = {
      quotaRemaining: result.quota_remaining ?? null,
      quotaTotal: result.quota_total ?? null,
      planEndsAt: result.plan_ends_at ?? null,
    };

    if (status === "free_used" || status === "charged") {
      res.status(200).json({
        ok: true,
        status,
        charged: result.charged === true,
        ...quotaFields,
      });
      return;
    }

    if (status === "already_recorded") {
      // 멱등 재생 — 같은 attemptId로 재호출(더블클릭·네트워크 재시도). 이번 호출로는
      // 아무것도 다시 차감하지 않는다.
      res.status(200).json({
        ok: true,
        status,
        charged: false,
        ...quotaFields,
      });
      return;
    }

    if (status === "no_entitlement") {
      fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
      );
      return;
    }

    if (status === "entitlement_expired") {
      fail(res, 403, "ENTITLEMENT_EXPIRED", "이용권 사용 기간이 끝났어요.", {
        planEndsAt: quotaFields.planEndsAt,
      });
      return;
    }

    if (status === "quota_exhausted") {
      fail(
        res,
        409,
        "QUOTA_EXHAUSTED",
        "이용 가능한 횟수를 모두 사용했어요.",
        quotaFields,
      );
      return;
    }

    if (status === "attempt_conflict") {
      // 남의 attemptId 재사용 — 정상 흐름에서는 나오지 않는다(클라이언트가 매 제출
      // 플로우마다 crypto.randomUUID()로 새로 만든다).
      fail(
        res,
        409,
        "ATTEMPT_CONFLICT",
        "이미 사용된 요청입니다. 다시 시도해 주세요.",
      );
      return;
    }

    console.error("diagnosis/consume 알 수 없는 RPC 상태:", status);
    fail(res, 500, "INTERNAL", "학습진단 제출 처리에 실패했습니다.");
  },
});

export const config = { runtime: "nodejs" };
