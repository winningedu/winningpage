// POST /api/inquiry/finalize
// Authorization: Bearer <access_token>
//
// 심화탐구 확정과 적립 엔드포인트(명세 No.103~106, 25, 111, 179, 180, 개발계획 부록 B 4번).
//   요청  { sessionId, fields: ActivityFields }   fields 7항목(텍스트 5개는 비어 있으면 안 된다)
//   응답 200 { ok, status: "completed" | "already_completed", activityRecordId, finalReportId,
//              replySent: boolean | null }
//
// 계약:
//   - fn_inquiry_finalize 한 트랜잭션에서 세션 completed, 확정 리포트, 활동 기록 적립을 한다.
//     같은 세션 재요청은 같은 결과(already_completed)를 돌려준다.
//   - 세션에 성장설계 과제(plan_item_id)가 있으면 RPC 성공 뒤 같은 요청 안에서 과제 완료를 회신한다.
//     성공이면 replySent true, 실패면 확정은 유지하고 reply_pending 을 세워 replySent false.
//     과제가 없으면 replySent null 이다. 회신 실패는 응답을 막지 않는다.
//
// 오류: INVALID_BODY 400(extra.missing), NO_ENTITLEMENT 403, SESSION_NOT_FOUND 404, STEP_ORDER 409,
//       SESSION_NOT_OPEN 409, METHOD_NOT_ALLOWED 405, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 판단은 _lib/inquiry/finalizeFlow.ts 에서 검증한다.

import { completePlanItemFromProgram } from "../_lib/growth/plan/complete.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import {
  fail,
  hasInquiryAccess,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import { loadSession } from "../_lib/inquiry/db.js";
import {
  callFinalizeRpc,
  setReplyPending,
} from "../_lib/inquiry/evaluateDb.js";
import {
  mapFinalizeRpc,
  parseFinalizeBody,
  precheckFinalize,
  replyInputFor,
  replyOutcomeOf,
} from "../_lib/inquiry/finalizeFlow.js";
import type { SessionStatus } from "../_lib/inquiry/types.js";

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "확정하지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/finalize",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = parseFinalizeBody(req.body);
    if (!parsed.ok) {
      fail(
        res,
        400,
        "INVALID_BODY",
        parsed.reason,
        parsed.missing ? { missing: parsed.missing } : {},
      );
      return;
    }
    const { sessionId, fields } = parsed;
    if (!(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }
    const session = await loadSession(db, userId, sessionId);
    if (!session) {
      fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
      return;
    }

    // 이미 확정된 세션의 재요청은 RPC 가 멱등으로 답하므로 단계 검사를 건너뛴다.
    if (session.status !== "completed") {
      const pre = precheckFinalize({
        selectedTopicId: session.selected_topic_id,
        designReportId: session.design_report_id,
        latestEvaluationId: session.latest_evaluation_id,
        status: session.status as SessionStatus,
      });
      if (!pre.ok) {
        fail(res, pre.status, pre.code, pre.message, pre.extra);
        return;
      }
    }

    const mapped = mapFinalizeRpc(
      await callFinalizeRpc(db, sessionId, userId, fields),
    );
    if (!mapped.ok) {
      fail(res, mapped.status, mapped.code, mapped.message, mapped.extra);
      return;
    }

    let replySent: boolean | null = null;
    if (session.plan_item_id) {
      const input = replyInputFor(
        session.plan_item_id,
        mapped.activityRecordId,
      );
      let outcome = { replySent: false, replyPending: true };
      if (input) {
        try {
          outcome = replyOutcomeOf(
            await completePlanItemFromProgram(db, userId, input),
          );
        } catch (error) {
          // 회신 실패가 확정을 되돌리지 않는다. 표시를 세워 다음 호출에서 다시 보낸다.
          console.error("inquiry/finalize 회신 실패(보류):", sessionId, error);
        }
      }
      replySent = outcome.replySent;
      if (outcome.replyPending !== session.reply_pending) {
        await setReplyPending(db, userId, sessionId, outcome.replyPending);
      }
    }

    res.status(200).json({
      ok: true,
      status: mapped.status,
      activityRecordId: mapped.activityRecordId,
      finalReportId: mapped.finalReportId,
      replySent,
    });
  },
});

export const config = { runtime: "nodejs" };
