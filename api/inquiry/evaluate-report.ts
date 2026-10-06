// POST /api/inquiry/evaluate-report
// Authorization: Bearer <access_token>
//
// 심화탐구 평가 리포트 생성 엔드포인트(명세 No.22, 71, 77, 78, 81~102, 개발계획 부록 B 3번).
//   요청  { sessionId }
//   응답 200 { ok, evaluation: EvaluationView, submission: SubmissionView, attempts }
//
// 계약:
//   - 초안 작성본이 없으면 409 NO_SUBMISSION, 빈 절 422 SECTION_EMPTY, 분량 부족 422 SUBMISSION_TOO_SHORT
//     (모델 미호출, 차감 없음), 평가 성공이 상한이면 409 REEVALUATION_LIMIT.
//   - 모델에는 자리표시자를 지운 본문을 넘기고, 점수와 라벨은 서버가 계산한다(scoring.buildEvaluation).
//   - 초안 확정(is_draft false), 평가 행 저장, 세션 포인터 갱신은 검증을 통과한 뒤 한꺼번에 한다.
//     모델 실패로 끝나면 초안이 그대로 남아 다시 평가할 수 있다.
//   - 선점, 재요청, 종결, 되돌림은 공통 러너(_lib/inquiry/generate.ts)가 맡는다.
//
// 오류: INVALID_BODY 400, NO_ENTITLEMENT 403, SESSION_NOT_FOUND 404, STEP_ORDER 409, SESSION_NOT_OPEN 409,
//       NO_SUBMISSION 409, REEVALUATION_LIMIT 409, GENERATION_RUNNING 409, ATTEMPTS_EXHAUSTED 409,
//       SECTION_EMPTY 422, SUBMISSION_TOO_SHORT 422, GENERATION_VALIDATION_FAILED 422,
//       MODEL_UPSTREAM_FAILED 502, GENERATION_TIMEOUT 504, GENERATION_FATAL 500, METHOD_NOT_ALLOWED 405, INTERNAL 500.
//
// 핸들러 본문은 DB 와 모델에 묶여 단위 테스트하지 않는다. 판단은 _lib/inquiry/evaluateFlow.ts 에서 검증한다.

import { callStructured, PERFORMANCE_MODEL } from "../_lib/gemini.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { asGradeLabel } from "../_lib/inquiry/bootstrap.js";
import {
  fail,
  hasInquiryAccess,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import {
  loadDesignReport,
  loadDraftSubmission,
  loadSession,
  loadTopic,
  mustHave,
} from "../_lib/inquiry/db.js";
import {
  finalizeDraftSubmission,
  insertEvaluationReport,
  recordEvaluationOnSession,
} from "../_lib/inquiry/evaluateDb.js";
import {
  buildAppFacts,
  buildEvaluationRow,
  buildPromptInput,
  EVALUATION_PROMPT_VERSION,
  parseEvaluateBody,
  precheckEvaluation,
  retryNotesFor,
  validateEvaluation,
} from "../_lib/inquiry/evaluateFlow.js";
import { generationErrorOf, runGeneration } from "../_lib/inquiry/generate.js";
import { buildEvaluationPrompt } from "../_lib/inquiry/prompts.js";
import { normalizeSections } from "../_lib/inquiry/submission.js";
import type {
  DesignReport,
  SessionStatus,
  TopicDetail,
} from "../_lib/inquiry/types.js";
import { toEvaluationView, toSubmissionView } from "../_lib/inquiry/views.js";

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "평가 리포트를 만들지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/evaluate-report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = parseEvaluateBody(req.body);
    if (!parsed.ok) {
      fail(res, 400, "INVALID_BODY", parsed.reason);
      return;
    }
    const { sessionId } = parsed;
    if (!(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }
    const session = await loadSession(db, userId, sessionId);
    if (!session) {
      fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
      return;
    }

    const draft = await loadDraftSubmission(db, userId, sessionId);
    const draftSections = draft ? normalizeSections(draft.sections) : null;
    if (draft && !draftSections) {
      throw new Error(`inquiry_submissions ${draft.id}: sections 형식 오류`);
    }
    const pre = precheckEvaluation({
      session: {
        selectedTopicId: session.selected_topic_id,
        designReportId: session.design_report_id,
        latestEvaluationId: session.latest_evaluation_id,
        status: session.status as SessionStatus,
        evaluationCount: session.evaluation_count,
      },
      draftSections,
    });
    if (!pre.ok) {
      fail(res, pre.status, pre.code, pre.message, pre.extra);
      return;
    }
    // 사전 검사를 통과했으면 초안과 작성본이 있다.
    const submission = mustHave(draft, "inquiry_submissions 초안");
    const sections = mustHave(draftSections, "작성본 8절");

    const topic = mustHave(
      await loadTopic(
        db,
        userId,
        mustHave(session.selected_topic_id, "선택 주제"),
      ),
      "inquiry_topics 선택 주제",
    );
    const designRow = mustHave(
      await loadDesignReport(db, userId, sessionId),
      "inquiry_reports 설계 리포트",
    );
    const design = designRow.sections as DesignReport;
    const detail = topic.detail as TopicDetail;
    const grade = mustHave(
      asGradeLabel(session.grade_label),
      "세션 학년(고1~고3)",
    );

    const promptInput = buildPromptInput({
      grade,
      subject: session.subject,
      topic: {
        title: detail.title,
        question: detail.question,
        hypothesis1: detail.hypothesis1,
        hypothesis2: detail.hypothesis2,
      },
      design,
      sections,
      check: pre.check,
      linkageType: topic.linkage_type as
        | "direct"
        | "interest_based_provisional",
    });
    const facts = buildAppFacts({
      sections,
      check: pre.check,
      designSourceTableRows: design.sourceTable.length,
      isProvisional: promptInput.isProvisional,
    });

    const outcome = await runGeneration(
      db,
      userId,
      sessionId,
      {
        mode: "evaluation_report",
        precheck: () => ({ ok: true }),
        prompt: buildEvaluationPrompt({ ...promptInput, retryNotes: [] }),
        validate: validateEvaluation,
        retryPrompt: (issues, truncated) =>
          buildEvaluationPrompt({
            ...promptInput,
            retryNotes: retryNotesFor(issues, truncated),
          }),
        persist: async (evaluation) => {
          const nowIso = new Date().toISOString();
          const submitted = await finalizeDraftSubmission(
            db,
            userId,
            submission.id,
            nowIso,
          );
          const report = await insertEvaluationReport(
            db,
            buildEvaluationRow({
              sessionId,
              userId,
              submissionId: submission.id,
              topicId: topic.id,
              model: PERFORMANCE_MODEL,
              promptVersion: EVALUATION_PROMPT_VERSION,
              evaluation,
              facts,
            }),
          );
          await recordEvaluationOnSession(db, userId, sessionId, {
            evaluationId: report.id,
            evaluationCount: session.evaluation_count + 1,
            nowIso,
          });
          return { report, submission: submitted };
        },
      },
      {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      },
    );

    if (outcome.kind !== "ok") {
      const error = generationErrorOf(outcome);
      fail(res, error.status, error.code, error.message, error.extra);
      return;
    }
    const { report, submission: saved } = outcome.saved;
    res.status(200).json({
      ok: true,
      evaluation: toEvaluationView(report, saved.revision),
      submission: toSubmissionView(saved),
      attempts: outcome.attempts,
    });
  },
});

export const config = { runtime: "nodejs", maxDuration: 60 };
