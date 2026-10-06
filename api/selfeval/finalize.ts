// POST /api/selfeval/finalize
// Authorization: Bearer <access_token>
//
// 최종 저장(계획서 §2 9, 명세 No.63, No.75, No.132). 최종본(final) 리포트 저장, 활동 기록 승격,
// 세션 완료를 DB 한 트랜잭션으로 한다. 이미 완료된 세션의 재요청은 같은 결과를 돌려준다(멱등).
//
// 요청  { sessionId, promoted: { topic, concept, method, result, limitation, numbers: string[],
//         sources: string[] }, fulfillsPlanItem?: boolean(기본 true) }
// 응답  200 { ok, activityRecordId, finalRevision, reply: { status, code? }, currentStep: 6 }
//       reply.status 는 "sent"(성장설계에 회신함), "skipped"(연결된 항목이 없거나 이행하지
//       않음), "failed"(회신 실패, 저장은 유효하고 다음 진입 때 다시 보낸다, code 가 실린다).
//       실패는 { ok: false, code, message, ...extra }.
//
// 오류 코드
//   INVALID_BODY 400, PROMOTED_INVALID 400, SESSION_NOT_FOUND 404, SESSION_NOT_OPEN 409(archived),
//   STEP_ORDER 409 { currentStep }, VERIFICATION_MISSING 409, VERIFICATION_STALE 409(검증 뒤 본문이
//   바뀜), NOT_SUBMITTABLE 409(필수 수정이 남음), INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 api/_lib/selfeval/steps/finalize.ts 에서 검증한다.

import { completePlanItemFromProgram } from "../_lib/growth/plan/complete.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { fail } from "../_lib/selfeval/access.js";
import { loadReports, loadSession } from "../_lib/selfeval/db.js";
import {
  checkSessionOpen,
  sendOutcome,
} from "../_lib/selfeval/stepResponse.js";
import {
  runFinalize,
  validateFinalizeBody,
} from "../_lib/selfeval/steps/finalize.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/finalize",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateFinalizeBody(req.body);
    if (!validated.ok) {
      fail(res, 400, validated.code, validated.message);
      return;
    }
    const { body } = validated;
    const session = await loadSession(db, userId, body.sessionId);
    if (session === null) {
      fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
      return;
    }
    const closed = checkSessionOpen(session, true);
    if (closed !== null) {
      fail(res, closed.status, closed.code, closed.message);
      return;
    }
    const out = await runFinalize(
      db,
      userId,
      session,
      await loadReports(db, userId, session.id),
      body,
      {
        complete: completePlanItemFromProgram,
        now: () => new Date().toISOString(),
      },
    );
    sendOutcome(res, out, (r) => ({
      activityRecordId: r.activityRecordId,
      finalRevision: r.finalRevision,
      reply: r.reply,
      currentStep: r.currentStep,
    }));
  },
});
