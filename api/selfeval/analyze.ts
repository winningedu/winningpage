// POST /api/selfeval/analyze
// Authorization: Bearer <access_token>
//
// 11항목 분석(계획서 §2 6, 명세 No.37~43). action 으로 가른다.
//   run               핵심 활동을 모델로 분석한다. 직접 입력한 활동은 모델 없이 단계만 올린다.
//   save              학생이 고친 항목을 저장한다. 고친 항목만 출처를 다시 가른다.
//   resolve-conflict  보조 활동과 어긋난 수치 중 하나를 고른다.
//
// 요청  { sessionId, action: "run" }
//       { sessionId, action: "save", edits: { <항목>: string } }
//       { sessionId, action: "resolve-conflict", index: 0 이상 정수, choice: "a" | "b" }
// 응답  run              200 { ok, analysis, conflicts, analysisSource, currentStep, attempts, softIssues }
//       save, resolve    200 { ok, analysis }
//       analysis 는 { values, sources, conflicts }, analysisSource 는 "model" | "student".
//       실패는 { ok: false, code, message, ...extra }.
//
// 오류 코드
//   INVALID_BODY 400, CONFLICT_INDEX_INVALID 400, SESSION_NOT_FOUND 404,
//   SESSION_NOT_OPEN 409, STEP_ORDER 409 { currentStep }, STEP_RUNNING 409, STEP_SUPERSEDED 409,
//   ATTEMPTS_EXHAUSTED 409 { terminal }, STEP_VALIDATION_FAILED 422 { attempts, issues },
//   MODEL_UPSTREAM_FAILED 502, STEP_TIMEOUT 504, STEP_FATAL 500, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 규칙은 api/_lib/selfeval/steps/analyze.ts 에서 검증한다.

import { callStructured } from "../_lib/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { fail } from "../_lib/selfeval/access.js";
import { loadSession } from "../_lib/selfeval/db.js";
import {
  checkSessionOpen,
  sendOutcome,
} from "../_lib/selfeval/stepResponse.js";
import {
  resolveAnalysisConflict,
  runAnalyze,
  saveAnalysis,
  validateAnalyzeBody,
} from "../_lib/selfeval/steps/analyze.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 분석에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/analyze",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    const validated = validateAnalyzeBody(req.body);
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

    if (body.action === "run") {
      const out = await runAnalyze(db, userId, session, {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      });
      sendOutcome(res, out, (r) => ({
        analysis: r.analysis,
        conflicts: r.analysis.conflicts,
        analysisSource: r.analysisSource,
        currentStep: r.currentStep,
      }));
      return;
    }
    const out =
      body.action === "save"
        ? await saveAnalysis(db, userId, session, body.edits)
        : await resolveAnalysisConflict(
            db,
            userId,
            session,
            body.index,
            body.choice,
          );
    sendOutcome(res, out, (r) => ({ analysis: r.analysis }));
  },
});
