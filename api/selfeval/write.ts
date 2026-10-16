// POST /api/selfeval/write
// Authorization: Bearer <access_token>
//
// 본문 생성과 편집(계획서 §2 7, 명세 No.44~52). action 으로 가른다.
//   generate         분석을 바탕으로 본문을 만든다. 성공 뒤 이용권 1회를 차감한다(재생성은 추가 차감 없음).
//   edit             학생이 고친 문단을 저장한다. 문단 수는 바꿀 수 없다.
//   confirm-feeling  자료로 확인되지 않는 느낌 문장을 학생이 확인했다고 표시한다.
//
// 요청  { sessionId, action: "generate" }
//       { sessionId, action: "edit", paragraphs: string[] }
//       { sessionId, action: "confirm-feeling", sentenceId }
// 응답  generate      200 { ok, report: { id, revision, sections, charCount }, softIssues, attempts,
//                           charged, regenerationsLeft, currentStep }
//       edit, confirm 200 { ok, report: { id, revision, sections, charCount } }
//       charged false 는 차감하지 못한 것이지 생성 실패가 아니다. 진행은 막지 않는다.
//       softIssues 는 목표 글자 수를 벗어난 사유로, 있어도 본문은 저장된다.
//
// 오류 코드
//   INVALID_BODY 400, PARAGRAPH_COUNT 400, SESSION_NOT_FOUND 404, SENTENCE_NOT_FOUND 404,
//   NO_ENTITLEMENT 403, SESSION_NOT_OPEN 409, STEP_ORDER 409 { currentStep },
//   CONFLICTS_UNRESOLVED 409, QUOTA_EXHAUSTED 409, REGENERATE_EXHAUSTED 409,
//   STEP_RUNNING 409, STEP_SUPERSEDED 409, ATTEMPTS_EXHAUSTED 409 { terminal },
//   STEP_VALIDATION_FAILED 422 { attempts, issues }, MODEL_UPSTREAM_FAILED 502,
//   STEP_TIMEOUT 504, STEP_FATAL 500, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 api/_lib/selfeval/steps/write.ts 에서 검증한다.

import { callStructured } from "../_lib/ai/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { fail } from "../_lib/selfeval/access.js";
import { loadReports, loadSession } from "../_lib/selfeval/db.js";
import {
  checkSessionOpen,
  sendOutcome,
} from "../_lib/selfeval/stepResponse.js";
import {
  confirmFeelingSentence,
  runWrite,
  saveEdit,
  validateWriteBody,
} from "../_lib/selfeval/steps/write.js";
import type { GenerationSections } from "../_lib/selfeval/types.js";
import { detailBody } from "../_lib/selfeval/view.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 본문 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/write",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateWriteBody(req.body);
    if (!validated.ok) {
      fail(res, 400, "INVALID_BODY", validated.message);
      return;
    }
    const { body } = validated;
    const session = await loadSession(db, userId, body.sessionId);
    if (session === null) {
      fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
      return;
    }
    const closed = checkSessionOpen(session, false);
    if (closed !== null) {
      fail(res, closed.status, closed.code, closed.message);
      return;
    }
    const reports = await loadReports(db, userId, session.id);

    if (body.action === "generate") {
      const out = await runWrite(db, userId, session, reports, {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      });
      sendOutcome(res, out, (r) => ({
        report: r.report,
        charged: r.charged,
        regenerationsLeft: r.regenerationsLeft,
        currentStep: r.currentStep,
      }));
      return;
    }

    // 편집과 확인의 기준 본문은 생성본과 편집본 중 나중에 만든 것이다.
    const current = detailBody(session, [], reports).current;
    if (current === null) {
      fail(res, 409, "STEP_ORDER", "본문을 먼저 생성해 주세요.", {
        currentStep: session.current_step,
      });
      return;
    }
    const base = current.sections as GenerationSections;
    const out =
      body.action === "edit"
        ? await saveEdit(db, userId, session, base, body.paragraphs)
        : await confirmFeelingSentence(
            db,
            userId,
            session,
            base,
            body.sentenceId,
          );
    sendOutcome(res, out, (r) => ({ report: r.report }));
  },
});
