// POST /api/selfeval/verify
// Authorization: Bearer <access_token>
//
// 본문 검증(계획서 §2 8, 명세 No.53~62). 모델이 확인 문장의 통과 여부를 판정하고,
// 점수, 형식 검사, 필수 수정은 서버가 계산한다. 검증 대상은 생성본과 편집본 중 나중에 만든 것이다.
//
// 요청  { sessionId }
// 응답  200 { ok, verification: { id, revision, sections, score, mandatoryFixes }, charged,
//             currentStep, attempts, softIssues }
//       실패는 { ok: false, code, message, attempts?, issues?, terminal?, reversed? }.
//       reversed true 는 이번 실패로 차감한 이용권을 되돌렸다는 뜻이다(명세 No.16, No.81).
//       세션은 in_progress 로 남고 같은 요청을 다시 보낼 수 있다. 되돌린 뒤 성공하면 다시 차감한다.
//
// 오류 코드
//   INVALID_BODY 400, SESSION_NOT_FOUND 404, NO_ENTITLEMENT 403, SESSION_NOT_OPEN 409,
//   STEP_ORDER 409 { currentStep }, QUOTA_EXHAUSTED 409, STEP_RUNNING 409, STEP_SUPERSEDED 409,
//   ATTEMPTS_EXHAUSTED 409 { terminal }, STEP_VALIDATION_FAILED 422, MODEL_UPSTREAM_FAILED 502,
//   STEP_TIMEOUT 504, STEP_FATAL 500, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 api/_lib/selfeval/steps/verify.ts 에서 검증한다.

import { callStructured } from "../_lib/ai/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { fail } from "../_lib/selfeval/access.js";
import { loadReports, loadSession } from "../_lib/selfeval/db.js";
import {
  checkSessionOpen,
  sendOutcome,
} from "../_lib/selfeval/stepResponse.js";
import {
  runVerify,
  validateVerifyBody,
} from "../_lib/selfeval/steps/verify.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 검증에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/verify",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateVerifyBody(req.body);
    if (!validated.ok) {
      fail(res, 400, "INVALID_BODY", validated.message);
      return;
    }
    const session = await loadSession(db, userId, validated.body.sessionId);
    if (session === null) {
      fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
      return;
    }
    const closed = checkSessionOpen(session, false);
    if (closed !== null) {
      fail(res, closed.status, closed.code, closed.message);
      return;
    }
    const out = await runVerify(
      db,
      userId,
      session,
      await loadReports(db, userId, session.id),
      {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      },
    );
    sendOutcome(res, out, (r) => ({
      verification: r.verification,
      charged: r.charged,
      currentStep: r.currentStep,
    }));
  },
});
